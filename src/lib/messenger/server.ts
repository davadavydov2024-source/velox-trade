import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { sendWebPush } from "@/lib/webPushServer";
import { DEFAULT_PERMISSIONS, type MessengerAccount, type MessengerChat, type MessageKind } from "./types";

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
  // Если клиент прислал id своего устройства (заголовок X-Miligram-Device) — завершённый сеанс больше не пускаем
  const dev = req.headers.get("x-miligram-device");
  if (dev && DEVICE_RE.test(dev) && (await isSessionRevoked(uid, dev))) return { error: NextResponse.json({ error: "Сеанс завершён. Войди заново.", revoked: true }, { status: 401 }) };
  return { uid, account };
}

// ---- Код доступа и токен «шлюза» (HMAC, без хранения в базе) ----

const sha = (s: string) => createHash("sha256").update(s).digest();
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha(a), sha(b));
}

/** Секрет подписи токенов (билеты загрузки, токен шлюза). Отдельной переменной не требует: берётся MESSENGER_GATE_SECRET или уже существующий BLOB_READ_WRITE_TOKEN. */
export function signingSecret(): string | null {
  const s = process.env.MESSENGER_GATE_SECRET || process.env.BLOB_READ_WRITE_TOKEN;
  return s && s.length >= 16 ? createHash("sha256").update("miligram:" + s).digest("hex") : null;
}
const gateSecret = signingSecret;

/** Регистрация открыта для всех, пока на Vercel НЕ задан MESSENGER_ACCESS_CODE (по умолчанию — открыта, без пароля). */
export function registrationOpen(): boolean {
  return !process.env.MESSENGER_ACCESS_CODE;
}

export function accessCodeConfigured(): boolean {
  return !!process.env.MESSENGER_ACCESS_CODE && !!gateSecret();
}

/** Прошёл ли «шлюз»: если регистрация открыта — токен не нужен, иначе нужен верный gateToken. */
export function gatePassed(token: unknown): boolean {
  return registrationOpen() || verifyGateToken(token);
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
  if (RESERVED_HANDLES.has(handle)) throw new Error("handle-taken");
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
  if (kind === "poll") return `📊 ${(text ?? "Опрос").slice(0, 100)}`;
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
  extra?: Record<string, unknown>; // duration, waveform, width, height, sticker, poll
  silent?: boolean; // отправить без уведомления
}

const PUSH_CAP = 1000; // в больших каналах пушим не больше этого числа подписчиков за пост

/** Единая точка записи сообщения: сообщение + lastMessage + счётчики непрочитанных/упоминаний + пуши. */
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
  if (chat.autoDeleteSec) data.expireAt = now + chat.autoDeleteSec * 1000;
  const preview = previewOf(o.kind, o.text);

  // @упоминания (только в группах): находим участников по @handle
  const mentionUids: string[] = [];
  if (o.text && chat.type === "group") {
    const found = Array.from(new Set((o.text.match(/@([a-zA-Z][a-zA-Z0-9_]{3,23})/g) ?? []).map((h) => h.slice(1).toLowerCase()))).slice(0, 10);
    if (found.length) {
      const docs = await db.getAll(...found.map((h) => db.collection("messengerHandles").doc(h)));
      docs.forEach((d) => {
        const u = d.data()?.uid;
        if (typeof u === "string" && u !== sender.uid && chat.members.includes(u) && !mentionUids.includes(u)) mentionUids.push(u);
      });
    }
  }
  if (mentionUids.length) data.mentions = mentionUids;

  const others = chat.members.filter((m) => m !== sender.uid);
  const unreadRef = (uid: string) => db.collection("messengerUserChats").doc(uid).collection("chats").doc(chat.id);
  const unreadPatch = (uid: string) => ({ unread: FieldValue.increment(1), markedUnread: false, ...(mentionUids.includes(uid) ? { mentions: FieldValue.increment(1) } : {}) });

  // Первая пачка: сообщение + чат + первые 400 счётчиков; остальное (большие каналы) — следующими пачками (лимит батча Firestore — 500).
  const first = db.batch();
  first.set(msgRef, data);
  first.update(chatRef, { lastMessage: { text: preview, kind: o.kind, from: sender.uid, at: now }, updatedAt: now, [`readBy.${sender.uid}`]: now });
  others.slice(0, 400).forEach((uid) => first.set(unreadRef(uid), unreadPatch(uid), { merge: true }));
  await first.commit();
  for (let i = 400; i < others.length; i += 400) {
    const b = db.batch();
    others.slice(i, i + 400).forEach((uid) => b.set(unreadRef(uid), unreadPatch(uid), { merge: true }));
    await b.commit();
  }

  // Пуши: не для «без звука» (кроме упоминаний) и не при тихой отправке; сбой пуша не ломает отправку.
  if (o.silent) return msgRef.id;
  try {
    const targets = others.slice(0, PUSH_CAP);
    const settings = await db.getAll(...targets.map(unreadRef));
    const base = chat.type === "dm" ? sender.account.displayName : `${sender.account.displayName} в ${chat.title ?? "чате"}`;
    await Promise.allSettled(
      targets.map((uid, i) => {
        const st = settings[i].data();
        const mentioned = mentionUids.includes(uid);
        const muted = !!(st?.muted && (!st.mutedUntil || st.mutedUntil > now));
        if (muted && !mentioned) return Promise.resolve();
        const title = mentioned ? `${sender.account.displayName} упомянул(а) вас в ${chat.title ?? "чате"}` : base;
        return sendWebPush(uid, { title: title.slice(0, 120), body: preview, url: `/m?chat=${chat.id}` }, "messages");
      })
    );
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

// ---- Права в группах и каналах (как в Telegram) ----

export type Action =
  | "sendMessages" | "sendMedia" | "sendStickers" | "sendPolls" | "addMembers" | "pinMessages" | "changeInfo"
  | "deleteMessages" | "banUsers" | "inviteUsers" | "addAdmins" | "postMessages" | "editMessages";

const ADMIN_ONLY = new Set<Action>(["deleteMessages", "banUsers", "inviteUsers", "addAdmins", "postMessages", "editMessages"]);

/** Может ли uid сделать action в чате. Создатель — всё; админ — по своим правам (по умолчанию все, кроме addAdmins); участник — по правам группы и своим ограничениям. */
export function canDo(chat: MessengerChat, uid: string, action: Action): boolean {
  if (!chat.members.includes(uid)) return false;
  if (chat.type === "dm") return ["sendMessages", "sendMedia", "sendStickers", "sendPolls", "pinMessages"].includes(action);
  if (chat.createdBy === uid) return true;
  let act: Action = action;
  if (chat.type === "channel" && action.startsWith("send")) act = "postMessages"; // в канале пишут только админы
  if (act === "addMembers") act = "inviteUsers";
  const isAdmin = chat.admins.includes(uid);
  const rights = (chat.adminRights?.[uid] ?? {}) as Record<string, boolean | undefined>;
  if (isAdmin && (rights[act] ?? act !== "addAdmins")) return true;
  if (ADMIN_ONLY.has(act) || chat.type === "channel") return action === "addMembers" && chat.type === "group" ? !!{ ...DEFAULT_PERMISSIONS, ...(chat.permissions ?? {}) }.addMembers : false;
  const perms = { ...DEFAULT_PERMISSIONS, ...(chat.permissions ?? {}) } as Record<string, boolean>;
  const r = chat.restricted?.[uid] as Record<string, any> | undefined;
  if (r && r.until > Date.now() && r[action] === false) return false;
  return !!perms[action];
}

export const isChatAdmin = (chat: MessengerChat, uid: string) => chat.createdBy === uid || chat.admins.includes(uid);

// ---- Служебный аккаунт «MiliGram Push» (как чат «Telegram» с уведомлениями о входе и рассылками) ----

export const SERVICE_UID = "miligram";
export const RESERVED_HANDLES = new Set(["miligram", "miligrampush", "admin", "support", "velox", "moderator", "telegram", "official"]);
export const DEVICE_RE = /^[A-Za-z0-9_-]{16,64}$/;

let svcCache: MessengerAuth | null = null;
export async function ensureServiceAccount(): Promise<MessengerAuth> {
  if (svcCache) return svcCache;
  const db = adminDb();
  const ref = db.collection("messengerAccounts").doc(SERVICE_UID);
  const snap = await ref.get();
  let account = snap.data() as MessengerAccount | undefined;
  if (!account) {
    const now = Date.now();
    account = { uid: SERVICE_UID, handle: "miligram", displayName: "MiliGram Push", photoURL: "/miligram/icon-192.png", bio: "Официальные уведомления MiliGram", createdAt: now, lastSeenAt: now, showLastSeen: false, banned: false, verified: true };
    await ref.set(account);
    await db.collection("messengerHandles").doc("miligram").set({ uid: SERVICE_UID }, { merge: true });
  }
  svcCache = { uid: SERVICE_UID, account };
  return svcCache;
}

/** Служебное сообщение пользователю от «MiliGram Push»: создаёт закреплённый служебный чат (если его нет), пушит, считает непрочитанное. */
export async function sendServiceMessage(uid: string, text: string, opts: { silent?: boolean } = {}): Promise<void> {
  const svc = await ensureServiceAccount();
  const ref = adminDb().collection("messengerChats").doc(dmChatId(SERVICE_UID, uid));
  let snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ type: "dm", members: [SERVICE_UID, uid], admins: [], createdBy: SERVICE_UID, service: true, updatedAt: Date.now(), readBy: {}, pinnedMessageIds: [] });
    snap = await ref.get();
  }
  const chat = { id: ref.id, ...snap.data() } as MessengerChat;
  await postMessage({ chat, sender: svc, kind: "text", text: text.slice(0, 3900), silent: opts.silent });
}

// ---- Сеансы (устройства) ----

const revokedCache = new Map<string, { v: boolean; at: number }>();
export async function isSessionRevoked(uid: string, deviceId: string): Promise<boolean> {
  const key = `${uid}/${deviceId}`;
  const hit = revokedCache.get(key);
  if (hit && Date.now() - hit.at < 20_000) return hit.v;
  const v = (await adminDb().collection("messengerSessions").doc(uid).collection("list").doc(deviceId).get()).data()?.revoked === true;
  revokedCache.set(key, { v, at: Date.now() });
  return v;
}

/** Короткое описание устройства из User-Agent: «iPhone · Safari», «Windows · Chrome». */
export function describeDevice(ua: string): string {
  const os = /iPhone|iPad/.test(ua) ? (/iPad/.test(ua) ? "iPad" : "iPhone") : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Устройство";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /YaBrowser/.test(ua) ? "Яндекс Браузер" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "браузер";
  return `${os} · ${br}`;
}
