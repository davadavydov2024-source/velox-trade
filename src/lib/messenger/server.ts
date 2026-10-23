import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { sendWebPush } from "@/lib/webPushServer";
import type { MessengerAccount, MessengerChat, MessageKind } from "./types";

export const HANDLE_RE = /^[a-z][a-z0-9_]{3,23}$/;
export const GATE_TTL_MS = 15 * 60 * 1000;

export function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export type MessengerAuth = { uid: string; account: MessengerAccount };

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

/** Любой вошедший пользователь Firebase (аккаунта мессенджера может ещё не быть — для /join). */
export async function requireFirebaseUid(req: NextRequest): Promise<string | null> {
  const token = bearer(req);
  if (!token) return null;
  const decoded = await adminAuth().verifyIdToken(token).catch(() => null);
  return decoded?.uid ?? null;
}

/** Вошедший пользователь С аккаунтом мессенджера и без бана. */
export async function requireMessenger(req: NextRequest): Promise<MessengerAuth | { error: NextResponse }> {
  const uid = await requireFirebaseUid(req);
  if (!uid) return { error: fail("Нужно войти в аккаунт", 401) };
  const snap = await adminDb().collection("messengerAccounts").doc(uid).get();
  if (!snap.exists) return { error: fail("Аккаунт мессенджера не создан", 403) };
  const account = snap.data() as MessengerAccount;
  if (account.banned) return { error: fail("Доступ к мессенджеру закрыт", 403) };
  return { uid, account };
}

// ---- Код доступа и токен «шлюза» (HMAC, без хранения в базе) ----

const sha = (s: string) => createHash("sha256").update(s).digest();
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha(a), sha(b));
}

function gateSecret(): string | null {
  const s = process.env.MESSENGER_GATE_SECRET;
  return s && s.length >= 16 ? s : null;
}

export function accessCodeConfigured(): boolean {
  return !!process.env.MESSENGER_ACCESS_CODE && !!gateSecret();
}

export function checkAccessCode(code: string): boolean {
  const real = process.env.MESSENGER_ACCESS_CODE;
  return !!real && safeEqual(code.trim(), real.trim());
}

export function signGateToken(): string {
  const exp = Date.now() + GATE_TTL_MS;
  const nonce = randomBytes(8).toString("hex");
  const body = `${exp}.${nonce}`;
  const sig = createHmac("sha256", gateSecret()!).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function verifyGateToken(token: unknown): boolean {
  const secret = gateSecret();
  if (!secret || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, nonce, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = createHmac("sha256", secret).update(`${exp}.${nonce}`).digest("hex");
  return safeEqual(sig, expected);
}

// ---- Аккаунты ----

/** Создаёт аккаунт мессенджера и резервирует @handle (уникальность — через messengerHandles). */
export async function createAccount(uid: string, handle: string, displayName: string, photoURL: string | null = null) {
  const db = adminDb();
  const handleRef = db.collection("messengerHandles").doc(handle);
  const accRef = db.collection("messengerAccounts").doc(uid);
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    if ((await tx.get(handleRef)).exists) throw new Error("handle-taken");
    tx.set(handleRef, { uid });
    tx.set(accRef, { uid, handle, displayName, photoURL, bio: "", createdAt: now, lastSeenAt: now, showLastSeen: true, banned: false } satisfies MessengerAccount);
  });
}

export async function uidByHandle(handle: string): Promise<string | null> {
  const snap = await adminDb().collection("messengerHandles").doc(handle.toLowerCase().replace(/^@/, "")).get();
  const uid = snap.exists ? snap.data()!.uid : null; // у публичных каналов в этом документе chatId, а не uid
  return typeof uid === "string" ? uid : null;
}

// ---- Чаты и сообщения ----

export const dmChatId = (a: string, b: string) => [a, b].sort().join("_");

export async function loadChat(chatId: unknown, uid: string): Promise<{ chat: MessengerChat } | { error: NextResponse }> {
  if (typeof chatId !== "string" || !chatId || chatId.includes("/")) return { error: fail("chatId обязателен") };
  const snap = await adminDb().collection("messengerChats").doc(chatId).get();
  if (!snap.exists) return { error: fail("Чат не найден", 404) };
  const chat = { id: snap.id, ...snap.data() } as MessengerChat;
  if (!chat.members.includes(uid)) return { error: fail("Нет доступа к этому чату", 403) };
  return { chat };
}

/** Картинки принимаем только из нашего хранилища Vercel Blob — чужие ссылки (трекеры, фишинг) не пускаем. */
export function isOwnMediaUrl(u: unknown): u is string {
  if (typeof u !== "string" || u.length > 600) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export function previewOf(kind: MessageKind, text?: string): string {
  if (kind === "image") return text?.trim() ? `📷 ${text.trim().slice(0, 80)}` : "📷 Фото";
  if (kind === "voice") return "🎤 Голосовое сообщение";
  if (kind === "videoNote") return "📹 Видеосообщение";
  if (kind === "file") return "📎 Файл";
  if (kind === "sticker") return "🖼 Стикер";
  return (text ?? "").trim().slice(0, 120);
}

interface PostOpts {
  chat: MessengerChat;
  sender: MessengerAuth;
  kind: MessageKind;
  text?: string;
  mediaUrl?: string;
  replyTo?: { msgId: string; from: string; preview: string };
  forwardedFrom?: { name: string; uid?: string };
  extra?: Record<string, unknown>; // duration, waveform, width, height (после cleanMediaMeta)
}

/** Единая точка записи сообщения: сообщение + lastMessage + счётчики непрочитанных + пуши. */
export async function postMessage(o: PostOpts): Promise<string> {
  const db = adminDb();
  const { chat, sender } = o;
  const now = Date.now();
  const chatRef = db.collection("messengerChats").doc(chat.id);
  const msgRef = chatRef.collection("messages").doc();

  const data: Record<string, unknown> = { from: sender.uid, kind: o.kind, reactions: {}, createdAt: now };
  if (o.text) data.text = o.text;
  if (o.mediaUrl) data.mediaUrl = o.mediaUrl;
  if (o.replyTo) data.replyTo = o.replyTo;
  if (o.forwardedFrom) data.forwardedFrom = o.forwardedFrom;
  if (o.extra) Object.assign(data, o.extra);
  if (chat.type === "channel") data.views = 0;
  const preview = previewOf(o.kind, o.text);

  const batch = db.batch();
  batch.set(msgRef, data);
  batch.update(chatRef, { lastMessage: { text: preview, kind: o.kind, from: sender.uid, at: now }, updatedAt: now, [`readBy.${sender.uid}`]: now });
  const others = chat.members.filter((m) => m !== sender.uid);
  for (const m of others) {
    batch.set(db.collection("messengerUserChats").doc(m).collection("chats").doc(chat.id), { unread: FieldValue.increment(1) }, { merge: true });
  }
  await batch.commit();

  // Пуши (не для чатов «без звука»); сбой пуша не должен ломать отправку.
  try {
    const settings = await db.getAll(...others.map((m) => db.collection("messengerUserChats").doc(m).collection("chats").doc(chat.id)));
    const title = chat.type === "dm" ? sender.account.displayName : `${sender.account.displayName} в ${chat.title ?? "чате"}`;
    const targets = others.filter((_, i) => {
      const s = settings[i].data();
      return !(s?.muted && (!s.mutedUntil || s.mutedUntil > now));
    });
    await Promise.allSettled(targets.map((uid) => sendWebPush(uid, { title: title.slice(0, 120), body: preview, url: `/m?chat=${chat.id}` }, "messages")));
  } catch (err) {
    console.error("messenger push error:", err);
  }
  return msgRef.id;
}

// ---- Медиа, блокировки, права в каналах ----

/** Файл загружен самим пользователем через upload-ticket (путь messenger/<uid>/...). */
export function ownsMedia(url: string, uid: string): boolean {
  try {
    return new URL(url).pathname.startsWith(`/messenger/${uid}/`);
  } catch {
    return false;
  }
}

/** Оставляет только безопасные числовые метаданные медиа. */
export function cleanMediaMeta(b: any, kind: MessageKind): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 10) / 10 : undefined);
  if (kind === "voice" || kind === "videoNote") {
    const d = num(b?.duration, kind === "voice" ? 600 : 60);
    if (d !== undefined) out.duration = d;
  }
  if (kind === "voice" && Array.isArray(b?.waveform)) {
    out.waveform = b.waveform.slice(0, 64).map((n: unknown) => Math.max(0, Math.min(255, Math.round(Number(n) || 0))));
  }
  if (kind === "image" || kind === "videoNote") {
    const w = num(b?.width, 10000);
    const h = num(b?.height, 10000);
    if (w !== undefined) out.width = Math.round(w);
    if (h !== undefined) out.height = Math.round(h);
  }
  return out;
}

/** В личном чате: заблокировал ли кто-то из двоих другого. */
export async function isDmBlocked(chat: MessengerChat, uid: string): Promise<boolean> {
  if (chat.type !== "dm") return false;
  const other = chat.members.find((m) => m !== uid);
  if (!other) return false; // «Избранное»
  const db = adminDb();
  const [a, b] = await db.getAll(db.collection("messengerBlocks").doc(uid).collection("blocked").doc(other), db.collection("messengerBlocks").doc(other).collection("blocked").doc(uid));
  return a.exists || b.exists;
}

/** Канал: писать могут только админы. Возвращает текст ошибки или null. */
export function canPost(chat: MessengerChat, uid: string): string | null {
  if (chat.type === "channel" && !chat.admins.includes(uid)) return "В канале пишут только админы";
  return null;
}
