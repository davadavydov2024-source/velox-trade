import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/apiRateLimit";
import { sendWebPush } from "@/lib/webPushServer";
import { fail, isDmBlocked, loadChat, postMessage, requireMessenger } from "@/lib/messenger/server";
import { buildIceServers } from "@/lib/messenger/callIce";
import type { ChatCall, MessengerAccount, MessengerChat } from "@/lib/messenger/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RING_MS = 60_000; // столько звонок считается «звонящим»
const BEAT_MS = 60_000; // столько активный звонок считается живым после последнего «я на линии»
const MAX_SDP = 24_000;

const isLive = (c: ChatCall | undefined, now: number): boolean => {
  if (!c) return false;
  if (c.status === "ringing") return now - c.startedAt < RING_MS;
  if (c.status === "active") return now - Math.max(c.answeredAt ?? 0, ...Object.values(c.beat ?? {})) < BEAT_MS;
  return false;
};

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

/** GET — настройки ICE (STUN/TURN) для звонка. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const { iceServers, hasTurn } = buildIceServers(me.uid);
  return NextResponse.json({ iceServers, hasTurn }, { headers: { "cache-control": "no-store" } });
}

/**
 * POST { action, chatId, ... } — сигналинг голосового звонка 1-на-1 (WebRTC). Всё состояние — в messengerChats/{chatId}.call.
 *  start  { offer }            — позвонить;   answer { callId, answer } — ответить;
 *  beat   { callId }           — «я на линии»; end { callId, reason }   — повесить трубку / отклонить / отменить.
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const action = b.action;
  const loaded = await loadChat(b.chatId, me.uid);
  if ("error" in loaded) return loaded.error;
  const chat = loaded.chat;
  const db = adminDb();
  const chatRef = db.collection("messengerChats").doc(chat.id);
  const now = Date.now();

  if (chat.type !== "dm" || chat.service) return fail("Звонки доступны только в личных чатах");
  const peerUid = chat.members.find((m) => m !== me.uid);
  if (!peerUid) return fail("Нельзя позвонить самому себе");

  // ---- позвонить ----
  if (action === "start") {
    const offer = b.offer;
    if (typeof offer !== "string" || !offer.startsWith("v=0") || offer.length > MAX_SDP) return fail("Некорректный запрос звонка");
    if (!(await rateLimit(`call_start_${me.uid}`, 12, 60_000))) return fail("Слишком много звонков подряд. Подожди минуту.", 429);
    const peerSnap = await db.collection("messengerAccounts").doc(peerUid).get();
    const peer = peerSnap.data() as MessengerAccount | undefined;
    if (!peer || peer.banned) return fail("Пользователь недоступен", 403);
    if (peer.bot || peerUid.startsWith("bot_") || peerUid === "velox_dating") return fail("Этому аккаунту нельзя позвонить");
    if (await isDmBlocked(chat, me.uid)) return fail("Звонок недоступен: один из вас заблокировал другого", 403);

    const callId = db.collection("_").doc().id;
    const res = await db.runTransaction(async (tx) => {
      const cur = ((await tx.get(chatRef)).data() as MessengerChat | undefined)?.call;
      if (isLive(cur, now)) return "busy" as const;
      const call: ChatCall = { id: callId, from: me.uid, to: peerUid, status: "ringing", startedAt: now, offer };
      tx.update(chatRef, { call });
      return "ok" as const;
    });
    if (res === "busy") return fail("Линия занята: в этом чате уже идёт звонок", 409);

    await sendWebPush(peerUid, { title: "📞 Входящий звонок", body: `${me.account.displayName} звонит вам`, url: `/m/app?chat=${chat.id}` }, "messages");
    return NextResponse.json({ ok: true, callId });
  }

  // дальше — действия над существующим звонком
  const callId = typeof b.callId === "string" ? b.callId : "";
  if (!callId) return fail("callId обязателен");

  if (action === "answer") {
    const answer = b.answer;
    if (typeof answer !== "string" || !answer.startsWith("v=0") || answer.length > MAX_SDP) return fail("Некорректный ответ на звонок");
    const ok = await db.runTransaction(async (tx) => {
      const c = ((await tx.get(chatRef)).data() as MessengerChat | undefined)?.call;
      if (!c || c.id !== callId || c.to !== me.uid || c.status !== "ringing" || now - c.startedAt > RING_MS + 15_000) return false;
      tx.update(chatRef, { "call.status": "active", "call.answer": answer, "call.answeredAt": now, [`call.beat.${me.uid}`]: now });
      return true;
    });
    return ok ? NextResponse.json({ ok: true }) : fail("Звонок уже завершён", 409);
  }

  if (action === "beat") {
    const ok = await db.runTransaction(async (tx) => {
      const c = ((await tx.get(chatRef)).data() as MessengerChat | undefined)?.call;
      if (!c || c.id !== callId || c.status !== "active") return false;
      tx.update(chatRef, { [`call.beat.${me.uid}`]: now });
      return true;
    });
    return NextResponse.json({ ok, live: ok }); // live: false — звонок уже закончен, клиенту пора отключиться
  }

  if (action === "end") {
    const asked = String(b.reason ?? "hangup");
    type Done = { call: ChatCall; reason: NonNullable<ChatCall["endReason"]>; duration?: number } | null;
    const done: Done = await db.runTransaction(async (tx) => {
      const c = ((await tx.get(chatRef)).data() as MessengerChat | undefined)?.call;
      if (!c || c.id !== callId || c.status === "ended") return null;
      let reason: NonNullable<ChatCall["endReason"]>;
      if (c.status === "active") reason = asked === "failed" ? "failed" : "hangup";
      else if (me.uid === c.to) reason = asked === "busy" ? "busy" : "declined";
      else reason = asked === "missed" ? "missed" : "cancelled";
      const duration = c.status === "active" && c.answeredAt ? Math.max(0, (now - c.answeredAt) / 1000) : undefined;
      tx.update(chatRef, { "call.status": "ended", "call.endedAt": now, "call.endReason": reason, "call.offer": FieldValue.delete(), "call.answer": FieldValue.delete() });
      return { call: c, reason, duration };
    });
    if (!done) return NextResponse.json({ ok: true, already: true });

    // запись о звонке в чат (один раз — её пишет тот, кто перевёл звонок в «завершён»)
    try {
      const callerSnap = await db.collection("messengerAccounts").doc(done.call.from).get();
      const caller = { uid: done.call.from, account: callerSnap.data() as MessengerAccount };
      const text =
        done.reason === "hangup" ? `📞 Звонок · ${fmt(done.duration ?? 0)}`
        : done.reason === "failed" ? `📞 Звонок прервался${done.duration ? ` · ${fmt(done.duration)}` : ""}`
        : done.reason === "declined" ? "📞 Звонок отклонён"
        : done.reason === "busy" ? "📞 Абонент занят"
        : done.reason === "cancelled" ? "📞 Отменённый звонок"
        : "📞 Пропущенный звонок";
      await postMessage({
        chat, sender: caller, kind: "system", text, silent: true,
        extra: { call: { from: done.call.from, reason: done.reason, ...(done.duration !== undefined ? { duration: Math.round(done.duration) } : {}) } },
      });
      // postMessage считает системную запись непрочитанной у собеседника — для состоявшихся/отклонённых звонков это лишнее
      if (done.reason !== "missed" && done.reason !== "cancelled") {
        await db.collection("messengerUserChats").doc(done.call.to).collection("chats").doc(chat.id).set({ unread: FieldValue.increment(-1) }, { merge: true });
      }
      if (done.reason === "missed" || done.reason === "cancelled") {
        await sendWebPush(done.call.to, { title: "📞 Пропущенный звонок", body: `${caller.account?.displayName ?? "Собеседник"} звонил(а) вам`, url: `/m/app?chat=${chat.id}` }, "messages");
      }
    } catch (err) {
      console.error("call log error:", err);
    }
    return NextResponse.json({ ok: true });
  }

  return fail("Неизвестное действие");
}
