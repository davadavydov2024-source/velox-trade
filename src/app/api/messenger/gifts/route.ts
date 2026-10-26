import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { dmChatId, fail, isDmBlocked, postMessage, requireMessenger, SERVICE_UID } from "@/lib/messenger/server";
import { GIFT_CONVERT_RATE, GIFT_MESSAGE_MAX, giftById, type GiftView, type MessengerGift } from "@/lib/messenger/gifts";
import type { MessengerAccount, MessengerChat } from "@/lib/messenger/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET                → { wallet, stock: { [giftId]: sold } }  — баланс ⭐ и сколько ограниченных подарков уже раскуплено
 * GET ?uid=<uid|me>  → { gifts: GiftView[], total, stars }    — подарки в профиле (скрытые видит только владелец)
 */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const db = adminDb();
  const uidParam = req.nextUrl.searchParams.get("uid");

  if (!uidParam) {
    const [user, stockSnap] = await Promise.all([db.collection("users").doc(me.uid).get(), db.collection("messengerGiftStock").get()]);
    const stock: Record<string, number> = {};
    stockSnap.forEach((d) => (stock[d.id] = (d.data().sold as number | undefined) ?? 0));
    return NextResponse.json({ wallet: (user.data()?.starsWallet as number | undefined) ?? 0, stock });
  }

  const target = uidParam === "me" ? me.uid : uidParam;
  if (!target || target.includes("/")) return fail("uid некорректен");
  const owner = target === me.uid;
  const snap = await db.collection("messengerGifts").where("to", "==", target).limit(300).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessengerGift).filter((g) => owner || !g.hidden).sort((a, b) => b.at - a.at);

  const senderIds = Array.from(new Set(rows.filter((g) => !g.anonymous || owner).map((g) => g.from)));
  const accs = senderIds.length ? await db.getAll(...senderIds.map((u) => db.collection("messengerAccounts").doc(u))) : [];
  const byUid: Record<string, MessengerAccount | undefined> = {};
  accs.forEach((a, i) => (byUid[senderIds[i]] = a.data() as MessengerAccount | undefined));

  const gifts: GiftView[] = rows.map((g) => {
    // анонимного отправителя видит только получатель (и сам отправитель)
    const showSender = !g.anonymous || owner || g.from === me.uid;
    const s = showSender ? byUid[g.from] ?? (g.from === me.uid ? me.account : undefined) : undefined;
    return {
      id: g.id, giftId: g.giftId, price: g.price, message: g.message, at: g.at, hidden: !!g.hidden, anonymous: !!g.anonymous,
      from: s ? { uid: g.from, displayName: s.displayName, photoURL: s.photoURL ?? null } : null,
      ...(g.nft ? { nft: g.nft } : {}),
    };
  });
  return NextResponse.json({ gifts, total: gifts.length, stars: gifts.reduce((n, g) => n + g.price, 0) });
}

/**
 * POST { action: "send", toUid, giftId, message?, anonymous? } — купить подарок за ⭐ кошелька и отправить.
 * POST { action: "toggle", id, hidden } — показать/скрыть свой подарок в профиле.
 * POST { action: "convert", id }        — обменять полученный подарок на ⭐ (GIFT_CONVERT_RATE от цены).
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const db = adminDb();

  if (b.action === "toggle") {
    const id = typeof b.id === "string" && !b.id.includes("/") ? b.id : "";
    if (!id) return fail("id обязателен");
    const ref = db.collection("messengerGifts").doc(id);
    const g = (await ref.get()).data() as MessengerGift | undefined;
    if (!g || g.to !== me.uid) return fail("Подарок не найден", 404);
    await ref.update({ hidden: b.hidden === true });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "convert") {
    if (!(await rateLimit(`msgr_gift_conv_${me.uid}`, 20, 60_000))) return fail("Слишком часто", 429);
    const id = typeof b.id === "string" && !b.id.includes("/") ? b.id : "";
    if (!id) return fail("id обязателен");
    const ref = db.collection("messengerGifts").doc(id);
    try {
      const back = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const g = snap.data() as MessengerGift | undefined;
        if (!g || g.to !== me.uid) throw new Error("not-found");
        if (g.nft) throw new Error("nft"); // NFT-подарки не обмениваются на звёзды
        const stars = Math.floor(g.price * GIFT_CONVERT_RATE);
        tx.delete(ref);
        tx.set(db.collection("users").doc(me.uid), { starsWallet: FieldValue.increment(stars) }, { merge: true });
        tx.set(db.collection("starsWalletLog").doc(), { uid: me.uid, delta: stars, type: "gift_convert", ref: id, at: Date.now() });
        return stars;
      });
      return NextResponse.json({ ok: true, stars: back });
    } catch (e: any) {
      if (e?.message === "not-found") return fail("Подарок не найден", 404);
      if (e?.message === "nft") return fail("NFT-подарок нельзя обменять на звёзды");
      console.error("gift convert error:", e);
      return fail("Не удалось обменять подарок", 500);
    }
  }

  if (b.action !== "send") return fail("action: send | toggle | convert");

  if (!(await rateLimit(`msgr_gift_${me.uid}`, 10, 60_000))) return fail("Слишком часто, подожди немного", 429);
  const gift = giftById(String(b.giftId ?? ""));
  if (!gift) return fail("Такого подарка нет", 404);
  const toUid = typeof b.toUid === "string" && b.toUid && !b.toUid.includes("/") ? b.toUid : "";
  if (!toUid || toUid === SERVICE_UID) return fail("Выбери получателя");
  const message = typeof b.message === "string" ? b.message.trim().slice(0, GIFT_MESSAGE_MAX) : "";
  const anonymous = b.anonymous === true;

  const targetSnap = await db.collection("messengerAccounts").doc(toUid).get();
  const target = targetSnap.data() as MessengerAccount | undefined;
  if (!target || target.banned) return fail("Пользователь недоступен", 404);

  // чат (если уже есть) — проверяем блокировки и потом кладём туда карточку подарка
  const chatId = dmChatId(me.uid, toUid);
  const chatRef = db.collection("messengerChats").doc(chatId);
  const chatSnap = await chatRef.get();
  let chat = chatSnap.exists ? ({ id: chatSnap.id, ...chatSnap.data() } as MessengerChat) : null;
  if (chat && (await isDmBlocked(chat, me.uid))) return fail("Нельзя отправить подарок этому пользователю", 403);
  if (!chat) {
    const other = await db.collection("messengerBlocks").doc(toUid).collection("blocked").doc(me.uid).get();
    if (other.exists) return fail("Нельзя отправить подарок этому пользователю", 403);
  }

  const userRef = db.collection("users").doc(me.uid);
  const stockRef = db.collection("messengerGiftStock").doc(gift.id);
  const giftRef = db.collection("messengerGifts").doc();
  const now = Date.now();
  let wallet = 0;
  try {
    wallet = await db.runTransaction(async (tx) => {
      const [user, stock] = await Promise.all([tx.get(userRef), gift.limited ? tx.get(stockRef) : Promise.resolve(null)]);
      const have = (user.data()?.starsWallet as number | undefined) ?? 0;
      if (have < gift.price) throw new Error("not-enough");
      if (gift.limited) {
        const sold = (stock?.data()?.sold as number | undefined) ?? 0;
        if (sold >= gift.limited) throw new Error("sold-out");
        tx.set(stockRef, { sold: sold + 1 }, { merge: true });
      }
      tx.set(userRef, { starsWallet: FieldValue.increment(-gift.price) }, { merge: true });
      tx.set(db.collection("starsWalletLog").doc(), { uid: me.uid, delta: -gift.price, type: "purchase", ref: `gift_${gift.id}`, at: now });
      tx.set(giftRef, { giftId: gift.id, from: me.uid, to: toUid, price: gift.price, at: now, hidden: false, anonymous, ...(message ? { message } : {}) } satisfies Omit<MessengerGift, "id">);
      return have - gift.price;
    });
  } catch (e: any) {
    if (e?.message === "not-enough") return NextResponse.json({ error: `Нужно ${gift.price} ⭐ на балансе — пополни кошелёк на странице «Пополнение ⭐»`, needTopup: true }, { status: 402 });
    if (e?.message === "sold-out") return fail("Этот подарок раскуплен", 409);
    console.error("gift send error:", e);
    return fail("Не удалось отправить подарок", 500);
  }

  // карточка в личном чате (если получатель принимает сообщения или чат уже есть); сбой не отменяет покупку
  try {
    if (!chat && target.privacy?.whoCanMessage !== "nobody") {
      await chatRef.set({ type: "dm", members: Array.from(new Set([me.uid, toUid])), admins: [], createdBy: me.uid, updatedAt: now, readBy: {}, pinnedMessageIds: [] });
      chat = { id: chatId, type: "dm", members: Array.from(new Set([me.uid, toUid])), admins: [], createdBy: me.uid, updatedAt: now, readBy: {}, pinnedMessageIds: [] };
    }
    if (chat) await postMessage({ chat, sender: me, kind: "gift", text: message || undefined, extra: { gift: { giftId: gift.id, giftDocId: giftRef.id, price: gift.price, to: toUid, ...(anonymous ? { anonymous: true } : {}) } } });
  } catch (err) {
    console.error("gift chat message error:", err);
  }
  return NextResponse.json({ ok: true, id: giftRef.id, wallet });
}

