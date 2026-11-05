import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, isChatAdmin, isOwnMediaUrl, loadChat, ownsMedia, postMessage, requireMessenger, sendServiceMessage } from "@/lib/messenger/server";
import { isPremium } from "@/lib/messenger/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Завершает розыгрыш: случайно выбирает победителей, пишет их в сообщение и шлёт уведомления от «MiliGram Push». */
async function finish(chatId: string, msgId: string): Promise<void> {
  const db = adminDb();
  const msgRef = db.collection("messengerChats").doc(chatId).collection("messages").doc(msgId);
  const snap = await msgRef.get();
  const d = snap.data();
  const g = d?.giveaway;
  if (!g || g.status !== "active") return;

  const parts = await msgRef.collection("participants").limit(20000).select().get();
  const pool = parts.docs.map((x) => x.id);
  const picked: string[] = [];
  const want = Math.min(Number(g.winnersCount) || 1, pool.length);
  for (let i = 0; i < want; i++) picked.push(pool.splice(randomInt(pool.length), 1)[0]);

  const accs = picked.length ? await db.getAll(...picked.map((u) => db.collection("messengerAccounts").doc(u))) : [];
  const winners = accs.map((a) => ({ uid: a.id, name: (a.data()?.displayName as string) ?? "Пользователь", handle: (a.data()?.handle as string) ?? "", photoURL: (a.data()?.photoURL as string) ?? null }));

  let done = false;
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(msgRef)).data()?.giveaway;
    if (!cur || cur.status !== "active") return;
    tx.update(msgRef, { "giveaway.status": "ended", "giveaway.winners": winners, "giveaway.endedAt": Date.now() });
    done = true;
  });
  if (!done) return;

  const chatTitle = ((await db.collection("messengerChats").doc(chatId).get()).data()?.title as string) ?? "канал";
  await Promise.all(winners.map((w) => sendServiceMessage(w.uid, `🏆 Вы победили в розыгрыше «${g.title}» (${chatTitle})!\nПриз: ${g.prize}\nОрганизатор свяжется с вами.`).catch(() => {})));
  const list = winners.length ? winners.map((w) => w.name).join(", ") : "никто не участвовал";
  if (typeof d?.from === "string") await sendServiceMessage(d.from, `✅ Розыгрыш «${g.title}» завершён.\nУчастников: ${g.count ?? 0}\nПобедители: ${list}`).catch(() => {});
}

/**
 * POST { action: "create", chatId, title, desc?, prize, photoUrl?, buttonText?, buttonColor?, endsAt?, maxParticipants?, winnersCount?, premiumOnly? }  — только админ канала/группы
 *      { action: "join" | "tick" | "end", chatId, msgId }
 * GET ?chatId=&msgId= — { joined }
 * Конец по времени проверяется «лениво»: любой зритель карточки шлёт tick, когда таймер дошёл до нуля.
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_gw_${me.uid}`, 30, 60_000))) return fail("Слишком часто", 429);
  const b = await req.json().catch(() => ({}));
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const { chat } = loaded;
  const db = adminDb();

  if (b.action === "create") {
    if (chat.type === "dm" || !isChatAdmin(chat, me.uid)) return fail("Розыгрыш может запустить админ канала или группы", 403);
    const title = clip(b.title, 80);
    const prize = clip(b.prize, 120);
    if (!title) return fail("Напиши название розыгрыша");
    if (!prize) return fail("Укажи приз");
    const now = Date.now();
    const endsAt = Number.isFinite(b.endsAt) && b.endsAt ? Number(b.endsAt) : 0;
    const max = Number.isInteger(b.maxParticipants) && b.maxParticipants ? Number(b.maxParticipants) : 0;
    if (endsAt && (endsAt < now + 60_000 || endsAt > now + 30 * 86_400_000)) return fail("Время окончания — от 1 минуты до 30 дней");
    if (max && (max < 2 || max > 100_000)) return fail("Участников — от 2 до 100 000");
    if (!endsAt && !max) return fail("Укажи, когда закончится розыгрыш: время или число участников");
    const winnersCount = Math.min(20, Math.max(1, Math.floor(Number(b.winnersCount) || 1)));
    const buttonColor = typeof b.buttonColor === "string" && COLOR_RE.test(b.buttonColor) ? b.buttonColor : "#3390ec";
    let mediaUrl: string | undefined;
    if (b.photoUrl) {
      if (!isOwnMediaUrl(b.photoUrl) || !ownsMedia(b.photoUrl, me.uid)) return fail("Фото нужно загрузить через мессенджер");
      mediaUrl = b.photoUrl;
    }
    const giveaway = {
      title, desc: clip(b.desc, 1000), prize, buttonText: clip(b.buttonText, 24) || "Участвовать", buttonColor,
      ...(endsAt ? { endsAt } : {}), ...(max ? { maxParticipants: max } : {}),
      winnersCount, premiumOnly: b.premiumOnly === true, count: 0, status: "active", recent: [],
    };
    const id = await postMessage({ chat, sender: me, kind: "giveaway", text: `🎁 Розыгрыш: ${title}`, mediaUrl, extra: { giveaway } });
    return NextResponse.json({ id });
  }

  const msgId = typeof b.msgId === "string" && b.msgId && !b.msgId.includes("/") ? b.msgId : "";
  if (!msgId) return fail("msgId обязателен");
  const msgRef = db.collection("messengerChats").doc(chat.id).collection("messages").doc(msgId);

  if (b.action === "tick") {
    const g = (await msgRef.get()).data()?.giveaway;
    if (g?.status === "active" && g.endsAt && g.endsAt <= Date.now()) await finish(chat.id, msgId);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "end") {
    const d = (await msgRef.get()).data();
    if (!d?.giveaway) return fail("Розыгрыш не найден", 404);
    if (d.from !== me.uid && !isChatAdmin(chat, me.uid)) return fail("Завершить может организатор", 403);
    await finish(chat.id, msgId);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "join") {
    const partRef = msgRef.collection("participants").doc(me.uid);
    try {
      const r = await db.runTransaction(async (tx) => {
        const [m, p] = await Promise.all([tx.get(msgRef), tx.get(partRef)]);
        const d = m.data();
        const g = d?.giveaway;
        if (!g || d?.deletedForAll) throw new Error("not-found");
        if (g.status !== "active") throw new Error("ended");
        if (g.endsAt && g.endsAt <= Date.now()) throw new Error("expired");
        if (p.exists) throw new Error("already");
        if (d?.from === me.uid) throw new Error("owner");
        if (g.premiumOnly && !isPremium(me.account)) throw new Error("premium");
        if (g.maxParticipants && g.count >= g.maxParticipants) throw new Error("full");
        const count = (g.count ?? 0) + 1;
        const recent = [{ uid: me.uid, name: me.account.displayName, photoURL: me.account.photoURL ?? null }, ...((g.recent ?? []) as { uid: string }[]).filter((x) => x.uid !== me.uid)].slice(0, 5);
        tx.set(partRef, { at: Date.now() });
        tx.update(msgRef, { "giveaway.count": count, "giveaway.recent": recent });
        return { count, full: !!g.maxParticipants && count >= g.maxParticipants };
      });
      if (r.full) await finish(chat.id, msgId);
      return NextResponse.json({ ok: true, count: r.count });
    } catch (e: any) {
      if (e?.message === "expired") { await finish(chat.id, msgId); return fail("Розыгрыш уже завершён", 400); }
      const map: Record<string, [string, number]> = {
        "not-found": ["Розыгрыш не найден", 404], ended: ["Розыгрыш уже завершён", 400], already: ["Ты уже участвуешь", 400],
        owner: ["Организатор не участвует в своём розыгрыше", 400], premium: ["Участвовать могут только пользователи Mili Premium", 403], full: ["Все места заняты", 400],
      };
      const m = map[e?.message];
      if (m) return fail(m[0], m[1]);
      console.error("giveaway join error:", e);
      return fail("Не удалось участвовать", 500);
    }
  }
  return fail("action: create, join, tick или end");
}

export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const loaded = await loadChat(req.nextUrl.searchParams.get("chatId"), me.uid);
  if ("error" in loaded) return loaded.error;
  const msgId = req.nextUrl.searchParams.get("msgId") ?? "";
  if (!msgId || msgId.includes("/")) return fail("msgId обязателен");
  const p = await adminDb().collection("messengerChats").doc(loaded.chat.id).collection("messages").doc(msgId).collection("participants").doc(me.uid).get();
  return NextResponse.json({ joined: p.exists });
}
