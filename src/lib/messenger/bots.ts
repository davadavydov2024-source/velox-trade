import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { HANDLE_RE, RESERVED_HANDLES, dmChatId, postMessage, type MessengerAuth } from "./server";
import type { MessengerAccount, MessengerChat } from "./types";

/**
 * Конструктор ботов (как @BotFather в Telegram, но без кода): человек задаёт имя, @юзернейм (на «bot»),
 * приветствие, команды/ключевые слова с ответами и кнопки. Бот — обычный аккаунт мессенджера (uid = bot_<id>),
 * ему можно написать из поиска. Отвечает только пока оплачен хостинг: 20 🪙 на 30 дней.
 * Хранилище: messengerBots/{id} (+ подколлекция users — кто уже писал боту), messengerAccounts/bot_<id>, messengerHandles/<handle>.
 */
export const BOT_LIMIT = 4;
export const BOT_HOST_PRICE = 20; // 🪙 за запуск
export const BOT_HOST_DAYS = 30; // сколько дней работает после оплаты (продление прибавляет срок)
export const BOT_UID_PREFIX = "bot_";
export const MAX_RULES = 30;
const DAY = 86_400_000;

export interface BotReply { text: string; buttons?: string[] }
export interface BotRule extends BotReply { trigger: string }
export interface BotDoc {
  id: string; uid: string; ownerUid: string; handle: string; name: string; description: string;
  welcome: BotReply; fallback: BotReply; rules: BotRule[];
  hostedUntil: number; createdAt: number; updatedAt: number;
  usersCount: number; messagesCount: number;
}

export class BotError extends Error { constructor(m: string, public status = 400) { super(m); } }

export const isBotUid = (u: unknown): u is string => typeof u === "string" && u.startsWith(BOT_UID_PREFIX);
export const botIdOf = (uid: string) => uid.slice(BOT_UID_PREFIX.length);
export const isHosted = (b: Pick<BotDoc, "hostedUntil">) => b.hostedUntil > Date.now();

const str = (v: unknown, max: number) => String(v ?? "").replace(/\r/g, "").trim().slice(0, max);

export function cleanReply(v: any, fallbackText: string): BotReply {
  const text = str(v?.text, 1000) || fallbackText;
  const buttons = Array.isArray(v?.buttons) ? Array.from(new Set(v.buttons.map((x: unknown) => str(x, 24)).filter(Boolean))).slice(0, 8) as string[] : [];
  return { text, ...(buttons.length ? { buttons } : {}) };
}

export function cleanRules(v: unknown): BotRule[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: BotRule[] = [];
  for (const r of v.slice(0, MAX_RULES)) {
    let trigger = str((r as any)?.trigger, 32).toLowerCase();
    if (trigger.startsWith("/")) trigger = "/" + trigger.slice(1).replace(/[^a-z0-9_]/g, "").slice(0, 31);
    if (!trigger || trigger === "/" || seen.has(trigger)) continue;
    seen.add(trigger);
    const rep = cleanReply(r, "");
    if (!rep.text) continue;
    out.push({ trigger, ...rep });
  }
  return out;
}

export const validBotHandle = (h: string) => HANDLE_RE.test(h) && h.endsWith("bot") && !RESERVED_HANDLES.has(h);

/** Создаёт бота: проверка лимита и уникальности @юзернейма — в одной транзакции. */
export async function createBot(ownerUid: string, nameRaw: unknown, handleRaw: unknown): Promise<BotDoc> {
  const name = str(nameRaw, 32);
  const handle = str(handleRaw, 24).toLowerCase().replace(/^@/, "");
  if (name.length < 2) throw new BotError("Имя бота — от 2 до 32 символов");
  if (!validBotHandle(handle)) throw new BotError("@юзернейм бота: 4–24 символа (a-z, 0-9, _), начинается с буквы и заканчивается на «bot», например @shop_bot");
  const db = adminDb();
  const ref = db.collection("messengerBots").doc();
  const uid = BOT_UID_PREFIX + ref.id;
  const hRef = db.collection("messengerHandles").doc(handle);
  const now = Date.now();
  const doc: BotDoc = {
    id: ref.id, uid, ownerUid, handle, name, description: "",
    welcome: { text: `Привет! Я ${name} 👋\nНапиши /help, чтобы узнать, что я умею.` },
    fallback: { text: "Не понял тебя 🤔 Напиши /help — там список того, что я умею." },
    rules: [], hostedUntil: 0, createdAt: now, updatedAt: now, usersCount: 0, messagesCount: 0,
  };
  await db.runTransaction(async (tx) => {
    const mine = await tx.get(db.collection("messengerBots").where("ownerUid", "==", ownerUid));
    if (mine.size >= BOT_LIMIT) throw new BotError(`Можно создать не больше ${BOT_LIMIT} ботов. Удали ненужного, чтобы освободить место.`, 403);
    if ((await tx.get(hRef)).exists) throw new BotError("Этот @юзернейм уже занят", 409);
    tx.set(hRef, { uid });
    tx.set(ref, doc);
    tx.set(db.collection("messengerAccounts").doc(uid), accountOf(doc));
  });
  return doc;
}

/** Команды, которые показываем в чате с ботом: /help и все свои команды (кроме /start — его даёт кнопка «Начать»). */
export function commandsOf(rules: BotRule[]): string[] {
  const out = ["/help"];
  for (const r of rules) if (r.trigger.startsWith("/") && r.trigger !== "/start" && !out.includes(r.trigger)) out.push(r.trigger);
  return out.slice(0, 12);
}

/** Публичный аккаунт бота. Создателя (ownerUid) сюда НЕ кладём — его видят только админы через messengerBots. */
function accountOf(b: BotDoc): MessengerAccount {
  return {
    uid: b.uid, handle: b.handle, displayName: b.name, photoURL: null, bio: b.description,
    createdAt: b.createdAt, lastSeenAt: Date.now(), showLastSeen: false, banned: false,
    bot: true, botCommands: commandsOf(b.rules), tag: "BOT",
    privacy: { whoCanMessage: "everyone", whoCanAddToGroups: "nobody" },
  };
}

/** Подтягивает публичный аккаунт бота к актуальному виду: команды и удаление устаревшего публичного ownerUid. */
export async function syncBotAccount(b: BotDoc): Promise<void> {
  await adminDb().collection("messengerAccounts").doc(b.uid).set({ botCommands: commandsOf(b.rules), ownerUid: FieldValue.delete() }, { merge: true });
}

export async function updateBot(ownerUid: string, id: string, p: any): Promise<void> {
  const db = adminDb();
  const ref = db.collection("messengerBots").doc(id);
  const cur = (await ref.get()).data() as BotDoc | undefined;
  if (!cur || cur.ownerUid !== ownerUid) throw new BotError("Бот не найден", 404);
  const upd: Partial<BotDoc> = { updatedAt: Date.now() };
  if (p.name !== undefined) { const n = str(p.name, 32); if (n.length < 2) throw new BotError("Имя бота — от 2 до 32 символов"); upd.name = n; }
  if (p.description !== undefined) upd.description = str(p.description, 200);
  if (p.welcome !== undefined) upd.welcome = cleanReply(p.welcome, cur.welcome.text);
  if (p.fallback !== undefined) upd.fallback = cleanReply(p.fallback, cur.fallback.text);
  if (p.rules !== undefined) upd.rules = cleanRules(p.rules);
  await ref.update(upd as Record<string, unknown>);
  const acc: Record<string, unknown> = { ownerUid: FieldValue.delete() }; // заодно убираем устаревшее публичное поле
  if (upd.name) acc.displayName = upd.name;
  if (upd.description !== undefined) acc.bio = upd.description;
  if (upd.rules !== undefined) acc.botCommands = commandsOf(upd.rules);
  await db.collection("messengerAccounts").doc(cur.uid).set(acc, { merge: true });
}

/** Запуск на хостинге: 20 🪙 с кошелька на 30 дней (повторная оплата продлевает). Списание и срок — одна транзакция. */
export async function hostBot(ownerUid: string, id: string): Promise<number> {
  const db = adminDb();
  const bRef = db.collection("messengerBots").doc(id);
  const uRef = db.collection("users").doc(ownerUid);
  let until = 0;
  await db.runTransaction(async (tx) => {
    const [bs, us] = await Promise.all([tx.get(bRef), tx.get(uRef)]);
    const b = bs.data() as BotDoc | undefined;
    if (!b || b.ownerUid !== ownerUid) throw new BotError("Бот не найден", 404);
    const have = (us.data()?.miliWallet as number | undefined) ?? 0;
    if (have < BOT_HOST_PRICE) throw new BotError(`Не хватает монет: запуск стоит ${BOT_HOST_PRICE} 🪙, на кошельке ${have} 🪙`, 402);
    until = Math.max(Date.now(), b.hostedUntil) + BOT_HOST_DAYS * DAY;
    tx.set(uRef, { miliWallet: FieldValue.increment(-BOT_HOST_PRICE) }, { merge: true });
    tx.update(bRef, { hostedUntil: until, updatedAt: Date.now() });
    tx.set(db.collection("miliWalletLog").doc(), { uid: ownerUid, delta: -BOT_HOST_PRICE, type: "bot_host", ref: id, name: `@${b.handle}`, at: Date.now() });
  });
  return until;
}

/** Удаляет бота: освобождает @юзернейм и слот. Оплаченный хостинг не возвращается. */
export async function deleteBot(ownerUid: string, id: string): Promise<void> {
  const db = adminDb();
  const ref = db.collection("messengerBots").doc(id);
  const b = (await ref.get()).data() as BotDoc | undefined;
  if (!b || b.ownerUid !== ownerUid) throw new BotError("Бот не найден", 404);
  const batch = db.batch();
  batch.delete(db.collection("messengerHandles").doc(b.handle));
  batch.delete(db.collection("messengerAccounts").doc(b.uid));
  batch.delete(ref);
  await batch.commit();
}

// ---- Ответы бота ----

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Что ответить на сообщение. «/start» — приветствие, «/help» — свой ответ или список команд; остальное — по правилам; иначе запасной ответ. */
export function pickReply(b: BotDoc, textRaw: string): BotReply {
  let t = norm(textRaw);
  if (t.startsWith("/")) t = t.split(" ")[0].replace(new RegExp(`@${b.handle}$`), "");
  const exact = b.rules.find((r) => r.trigger === t);
  if (exact) return exact;
  if (t === "/start") return b.welcome;
  if (t === "/help") {
    const cmds = b.rules.filter((r) => r.trigger.startsWith("/"));
    return { text: cmds.length ? `Что я умею:\n${cmds.map((c) => c.trigger).join("\n")}` : b.welcome.text, ...(b.welcome.buttons ? { buttons: b.welcome.buttons } : {}) };
  }
  if (!t.startsWith("/")) {
    const hit = b.rules.filter((r) => !r.trigger.startsWith("/") && t.includes(r.trigger)).sort((x, y) => y.trigger.length - x.trigger.length)[0];
    if (hit) return hit;
  }
  return b.fallback;
}

async function botChat(b: BotDoc, userUid: string): Promise<MessengerChat | null> {
  const snap = await adminDb().collection("messengerChats").doc(dmChatId(b.uid, userUid)).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as MessengerChat) : null;
}

/** Вызывается из api/messenger/send после сообщения пользователя в личном чате с ботом. Сбой бота не ломает отправку. */
export async function runBot(botUid: string, userUid: string, text: string): Promise<void> {
  const db = adminDb();
  const bSnap = await db.collection("messengerBots").doc(botIdOf(botUid)).get();
  const b = bSnap.data() as BotDoc | undefined;
  if (!b) return;
  const chat = await botChat(b, userUid);
  if (!chat) return;
  const sender: MessengerAuth = { uid: b.uid, account: accountOf(b) };

  if (!isHosted(b)) {
    // молчит, как остановленный бот в Telegram; хозяину подсказываем, как его запустить
    if (userUid === b.ownerUid) await postMessage({ chat, sender, kind: "text", text: `⏸ Бот не запущен. Открой Настройки → Боты и нажми «Запустить» (${BOT_HOST_PRICE} 🪙 на ${BOT_HOST_DAYS} дн.).` });
    return;
  }
  const uRef = bSnap.ref.collection("users").doc(userUid);
  const known = (await uRef.get()).exists;
  const reply = known ? pickReply(b, text) : pickReply(b, /^\/start\b/i.test(text.trim()) ? text : "/start");
  const firstTime = !known;
  await postMessage({ chat, sender, kind: "text", text: reply.text.slice(0, 3900), extra: reply.buttons?.length ? { kb: reply.buttons } : {} });
  // первое сообщение нового человека: приветствие, а если он спросил что-то конкретное — ответ следом
  if (firstTime && !/^\/start\b/i.test(text.trim())) {
    const direct = pickReply(b, text);
    if (direct !== b.fallback) await postMessage({ chat, sender, kind: "text", text: direct.text.slice(0, 3900), extra: direct.buttons?.length ? { kb: direct.buttons } : {} });
  }
  await Promise.all([
    firstTime ? uRef.set({ at: Date.now() }) : Promise.resolve(),
    bSnap.ref.update({ messagesCount: FieldValue.increment(1), ...(firstTime ? { usersCount: FieldValue.increment(1) } : {}) }),
  ]);
}

// ---- Для админов: кто создал бота ----

export interface AdminBotView {
  id: string; uid: string; handle: string; name: string; description: string;
  owner: { uid: string; handle: string; displayName: string; photoURL: string | null } | null;
  running: boolean; hostedUntil: number; usersCount: number; messagesCount: number; createdAt: number;
}

/** Все боты (или один по uid бота) вместе с создателем. Вызывать только после requireAdmin. */
export async function adminListBots(botUid?: string): Promise<AdminBotView[]> {
  const db = adminDb();
  const col = db.collection("messengerBots");
  const docs = botUid ? [await col.doc(botIdOf(botUid)).get()].filter((d) => d.exists) : (await col.orderBy("createdAt", "desc").limit(300).get()).docs;
  const bots = docs.map((d) => d.data() as BotDoc);
  const ownerIds = Array.from(new Set(bots.map((b) => b.ownerUid)));
  const owners = new Map<string, { uid: string; handle: string; displayName: string; photoURL: string | null }>();
  if (ownerIds.length) {
    const snaps = await db.getAll(...ownerIds.map((u) => db.collection("messengerAccounts").doc(u)));
    for (const s of snaps) {
      const a = s.data();
      if (a) owners.set(s.id, { uid: s.id, handle: a.handle ?? "", displayName: a.displayName ?? "", photoURL: a.photoURL ?? null });
    }
  }
  return bots.map((b) => ({
    id: b.id, uid: b.uid, handle: b.handle, name: b.name, description: b.description,
    owner: owners.get(b.ownerUid) ?? { uid: b.ownerUid, handle: "", displayName: "(аккаунт мессенджера не найден)", photoURL: null },
    running: isHosted(b), hostedUntil: b.hostedUntil, usersCount: b.usersCount ?? 0, messagesCount: b.messagesCount ?? 0, createdAt: b.createdAt,
  }));
}
