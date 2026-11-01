import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { RESERVED_HANDLES } from "./server";

/**
 * Премиум-юзернеймы («коллекционные @имена»): 2–24 символа, a-z/0-9/_, первая — буква.
 * Обычные имена — 4–24 символа, поэтому короткие 2–3 буквы существуют только как премиум.
 * messengerUsernames/{name}: ownerUid (null — не продан), shopPrice (магазин), salePrice (перепродажа), rentPerDay (аренда),
 * renterUid/rentUntil (кто арендует), usedBy (чей сейчас это @handle). messengerHandles/{name}: { premium: true, uid: null | uid }.
 * Аккаунт, пока использует премиум-имя, хранит baseHandle (обычное имя остаётся за ним) и premiumHandle.
 */
export const PREMIUM_RE = /^[a-z][a-z0-9_]{1,23}$/;
export const FEE_PCT = 10; // комиссия при перепродаже и аренде
export const PRICE_MAX = 100000;
export const RENT_DAYS_MAX = 30;
const DAY = 86_400_000;

export interface UsernameDoc {
  name: string; ownerUid: string | null; shopPrice: number | null; salePrice: number | null; rentPerDay: number | null;
  renterUid: string | null; rentUntil: number | null; usedBy: string | null; createdAt: number;
}
type Acc = { uid: string; handle: string; baseHandle?: string; premiumHandle?: string };

export class UErr extends Error { constructor(m: string, public status = 400) { super(m); } }
export const fee = (price: number) => Math.floor((price * FEE_PCT) / 100);

const uref = (db: Firestore, n: string) => db.collection("messengerUsernames").doc(n);
const href = (db: Firestore, n: string) => db.collection("messengerHandles").doc(n);
const aref = (db: Firestore, u: string) => db.collection("messengerAccounts").doc(u);
const wref = (db: Firestore, u: string) => db.collection("users").doc(u);
const log = (db: Firestore, tx: Transaction, uid: string, delta: number, type: string, name: string) =>
  tx.set(db.collection("miliWalletLog").doc(), { uid, delta, type, ref: name, name: `@${name}`, at: Date.now() });

export const validName = (n: unknown): n is string => typeof n === "string" && PREMIUM_RE.test(n) && !RESERVED_HANDLES.has(n);
const rentedNow = (d: UsernameDoc) => !!d.renterUid && (d.rentUntil ?? 0) > Date.now();

/** Записи (без чтений!) — вернуть аккаунту обычное имя и освободить премиум-имя. */
function writeDeactivate(db: Firestore, tx: Transaction, name: string, acc: Acc) {
  tx.update(aref(db, acc.uid), { handle: acc.baseHandle ?? acc.handle, baseHandle: FieldValue.delete(), premiumHandle: FieldValue.delete() });
  tx.set(href(db, name), { premium: true, uid: null });
  tx.update(uref(db, name), { usedBy: null });
}

async function getWallet(tx: Transaction, db: Firestore, uid: string) {
  return (((await tx.get(wref(db, uid))).data()?.miliWallet as number | undefined) ?? 0);
}

async function load(tx: Transaction, db: Firestore, name: string) {
  const s = await tx.get(uref(db, name));
  if (!s.exists) throw new UErr("Юзернейм не найден", 404);
  return s.data() as UsernameDoc;
}

/** Закончилась аренда — вернуть арендатору его обычное имя и освободить юзернейм. */
export async function settleOne(name: string): Promise<void> {
  const db = adminDb();
  await db.runTransaction(async (tx) => {
    const d = await load(tx, db, name);
    if (!d.renterUid || (d.rentUntil ?? 0) > Date.now()) return;
    const acc = d.usedBy === d.renterUid ? ((await tx.get(aref(db, d.renterUid))).data() as Acc | undefined) : undefined;
    if (acc && acc.premiumHandle === name) writeDeactivate(db, tx, name, acc);
    tx.update(uref(db, name), { renterUid: null, rentUntil: null, ...(acc ? {} : { usedBy: d.usedBy === d.renterUid ? null : d.usedBy }) });
  });
}

export async function settleExpired(limit = 20): Promise<void> {
  const snap = await adminDb().collection("messengerUsernames").where("rentUntil", "<=", Date.now()).limit(limit).get();
  for (const d of snap.docs) await settleOne(d.id).catch(() => {});
}

export async function buyShop(name: string, uid: string) {
  const db = adminDb();
  await db.runTransaction(async (tx) => {
    const d = await load(tx, db, name);
    if (d.ownerUid || !d.shopPrice) throw new UErr("Этот юзернейм уже продан", 409);
    if ((await getWallet(tx, db, uid)) < d.shopPrice) throw new UErr(`Не хватает звёзд: нужно ${d.shopPrice} ⭐`, 402);
    tx.set(wref(db, uid), { miliWallet: FieldValue.increment(-d.shopPrice) }, { merge: true });
    log(db, tx, uid, -d.shopPrice, "username_buy", name);
    tx.update(uref(db, name), { ownerUid: uid, shopPrice: null, boughtAt: Date.now() });
  });
}

export async function buyResale(name: string, uid: string) {
  await settleOne(name).catch(() => {});
  const db = adminDb();
  await db.runTransaction(async (tx) => {
    const d = await load(tx, db, name);
    if (!d.ownerUid || !d.salePrice) throw new UErr("Юзернейм не продаётся", 409);
    if (d.ownerUid === uid) throw new UErr("Это ваш юзернейм");
    if (rentedNow(d)) throw new UErr("Сейчас сдан в аренду — продать нельзя", 409);
    const owner = d.ownerUid, price = d.salePrice;
    const ownerAcc = d.usedBy === owner ? ((await tx.get(aref(db, owner))).data() as Acc | undefined) : undefined;
    if ((await getWallet(tx, db, uid)) < price) throw new UErr(`Не хватает звёзд: нужно ${price} ⭐`, 402);
    if (ownerAcc && ownerAcc.premiumHandle === name) writeDeactivate(db, tx, name, ownerAcc);
    const get = price - fee(price);
    tx.set(wref(db, uid), { miliWallet: FieldValue.increment(-price) }, { merge: true });
    tx.set(wref(db, owner), { miliWallet: FieldValue.increment(get) }, { merge: true });
    log(db, tx, uid, -price, "username_buy", name);
    log(db, tx, owner, get, "username_sale", name);
    tx.update(uref(db, name), { ownerUid: uid, salePrice: null, rentPerDay: null, usedBy: null });
  });
}

export async function rentName(name: string, uid: string, days: number) {
  await settleOne(name).catch(() => {});
  const db = adminDb();
  await db.runTransaction(async (tx) => {
    const d = await load(tx, db, name);
    if (!d.ownerUid || !d.rentPerDay) throw new UErr("Этот юзернейм не сдаётся в аренду", 409);
    if (d.ownerUid === uid) throw new UErr("Это ваш юзернейм");
    const extending = d.renterUid === uid && rentedNow(d);
    if (rentedNow(d) && !extending) throw new UErr("Уже арендован другим человеком", 409);
    const owner = d.ownerUid, price = d.rentPerDay * days;
    if ((await getWallet(tx, db, uid)) < price) throw new UErr(`Не хватает звёзд: нужно ${price} ⭐`, 402);
    const get = price - fee(price);
    tx.set(wref(db, uid), { miliWallet: FieldValue.increment(-price) }, { merge: true });
    tx.set(wref(db, owner), { miliWallet: FieldValue.increment(get) }, { merge: true });
    log(db, tx, uid, -price, "username_rent_out", name);
    log(db, tx, owner, get, "username_rent_in", name);
    tx.update(uref(db, name), { renterUid: uid, rentUntil: (extending ? (d.rentUntil as number) : Date.now()) + days * DAY });
  });
}

/** Начать использовать юзернейм как свой @handle (владелец — если он не сдан и не выставлен в аренду; арендатор — пока идёт аренда). */
export async function activate(name: string, uid: string) {
  await settleOne(name).catch(() => {});
  const db = adminDb();
  await db.runTransaction(async (tx) => {
    const d = await load(tx, db, name);
    const owner = d.ownerUid === uid;
    const renter = d.renterUid === uid && rentedNow(d);
    if (!owner && !renter) throw new UErr("Этот юзернейм вам не принадлежит", 403);
    if (owner && (rentedNow(d) || d.rentPerDay)) throw new UErr("Юзернейм сдан или выставлен в аренду — сначала снимите его с аренды", 409);
    if (d.usedBy === uid) return;
    if (d.usedBy) throw new UErr("Юзернейм сейчас занят", 409);
    const acc = (await tx.get(aref(db, uid))).data() as Acc | undefined;
    if (!acc) throw new UErr("Аккаунт не найден", 404);
    const prev = acc.premiumHandle && acc.premiumHandle !== name ? acc.premiumHandle : null;
    if (prev) { tx.set(href(db, prev), { premium: true, uid: null }); tx.update(uref(db, prev), { usedBy: null }); }
    tx.update(aref(db, uid), { handle: name, baseHandle: acc.baseHandle ?? acc.handle, premiumHandle: name });
    tx.set(href(db, name), { premium: true, uid });
    tx.update(uref(db, name), { usedBy: uid });
  });
}

/** Вернуть обычный @handle. */
export async function deactivate(name: string, uid: string) {
  const db = adminDb();
  await db.runTransaction(async (tx) => {
    const d = await load(tx, db, name);
    if (d.usedBy !== uid) throw new UErr("Вы сейчас не используете этот юзернейм");
    const acc = (await tx.get(aref(db, uid))).data() as Acc | undefined;
    if (!acc) throw new UErr("Аккаунт не найден", 404);
    writeDeactivate(db, tx, name, acc);
  });
}

/** Выставить / снять с продажи (price = null) или аренды (rentPerDay = null). */
export async function setListing(name: string, uid: string, patch: { salePrice?: number | null; rentPerDay?: number | null }) {
  const db = adminDb();
  await db.runTransaction(async (tx) => {
    const d = await load(tx, db, name);
    if (d.ownerUid !== uid) throw new UErr("Это не ваш юзернейм", 403);
    const sale = patch.salePrice, rent = patch.rentPerDay;
    if (sale && rentedNow(d)) throw new UErr("Сейчас сдан в аренду — продать нельзя", 409);
    let acc: Acc | undefined;
    if (rent && d.usedBy === uid) acc = (await tx.get(aref(db, uid))).data() as Acc | undefined;
    if (acc && acc.premiumHandle === name) writeDeactivate(db, tx, name, acc);
    tx.update(uref(db, name), { ...(sale !== undefined ? { salePrice: sale } : {}), ...(rent !== undefined ? { rentPerDay: rent } : {}) });
  });
}

// ---------- Генератор имён для админа ----------
const WORDS = ["nova", "luna", "aura", "zero", "echo", "neon", "flux", "onyx", "ruby", "jade", "ivy", "sky", "fox", "wolf", "hawk", "lynx", "orca", "raven", "tiger", "panda", "storm", "frost", "blaze", "ember", "spark", "pixel", "cyber", "turbo", "alpha", "omega", "delta", "sigma", "orbit", "comet", "cosmo", "galaxy", "lunar", "solar", "royal", "magic", "mystic", "shadow", "ghost", "phantom", "vortex", "matrix", "crypto", "gold", "silver", "diamond", "crown", "king", "queen", "boss", "ninja", "samurai", "dragon", "phoenix", "titan", "atlas", "apollo", "zeus", "thor", "loki", "mira", "vera", "lira", "amor", "dream", "mood", "vibe", "chill", "drift", "wave", "rush", "volt", "byte", "code", "game", "play", "star", "moon", "sun", "rain", "snow", "fire", "ice"];
const WORDS_RU = ["volk", "lisa", "medved", "zvezda", "luna", "solnce", "noch", "ogon", "veter", "groza", "korol", "tsar", "boyar", "bogatyr", "dusha", "mechta", "lyubov", "schaste", "udacha", "drug", "brat", "mama", "papa", "khan", "vityaz", "tigr", "orel", "sokol", "volna", "more", "zima", "leto", "vesna", "osen", "almaz", "zoloto", "serebro", "kot", "pes", "ptica"];
const C = "bdfgklmnprstvz", V = "aeiou";
const rnd = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const cvc = () => rnd([...C]) + rnd([...V]) + rnd([...C]);
const cv = () => rnd([...C]) + rnd([...V]);

export function suggestPrice(name: string): number {
  const len = name.length;
  let p = len <= 2 ? 3000 : len === 3 ? 1000 : len === 4 ? 400 : len === 5 ? 150 : len === 6 ? 80 : 40;
  if (/\d/.test(name)) p = Math.round(p * 0.6);
  if (/_/.test(name)) p = Math.round(p * 0.7);
  if (WORDS.includes(name) || WORDS_RU.includes(name)) p = Math.round(p * 1.5);
  return Math.max(10, Math.round(p / 5) * 5);
}

/** Придумывает свободные имена по шаблонам (слова, короткие произносимые, слово+число). Это правила и словари, без внешней ИИ-модели. */
export async function generateNames(count: number): Promise<{ name: string; price: number }[]> {
  const db = adminDb();
  const pool = new Set<string>();
  const add = (n: string) => { n = n.toLowerCase(); if (validName(n)) pool.add(n); };
  for (let i = 0; i < 6; i++) add(cvc());
  for (let i = 0; i < 3; i++) add(cv());
  for (let i = 0; i < count * 2; i++) {
    const r = Math.random();
    if (r < 0.35) add(rnd(WORDS));
    else if (r < 0.5) add(rnd(WORDS_RU));
    else if (r < 0.65) add(cvc() + rnd([...V]));
    else if (r < 0.8) add(cv() + cv());
    else if (r < 0.9) add(rnd(WORDS) + rnd(["x", "z", "o", "_"]));
    else add(rnd(WORDS) + rnd(["7", "77", "99", "1", "24", "01"]));
  }
  const names = Array.from(pool);
  const taken = new Set<string>();
  for (let i = 0; i < names.length; i += 100) {
    const refs = names.slice(i, i + 100).map((n) => href(db, n));
    (await db.getAll(...refs)).forEach((s) => { if (s.exists) taken.add(s.id); });
  }
  return names.filter((n) => !taken.has(n)).sort(() => Math.random() - 0.5).slice(0, count).map((name) => ({ name, price: suggestPrice(name) }));
}

export async function addToShop(items: { name: string; price: number }[]): Promise<{ added: string[]; skipped: string[]; reasons: string[] }> {
  const db = adminDb();
  const added: string[] = [], skipped: string[] = [], reasons: string[] = [];
  for (const it of items.slice(0, 60)) {
    const name = String(it.name ?? "").toLowerCase().replace(/^@/, "");
    const price = Math.floor(Number(it.price));
    if (!validName(name)) { skipped.push(name); reasons.push(`@${name || "?"}: имя должно быть 2–24 символа (a-z, 0-9, _), начинаться с буквы`); continue; }
    if (!(price >= 1 && price <= PRICE_MAX)) { skipped.push(name); reasons.push(`@${name}: укажи цену от 1 до ${PRICE_MAX} ⭐`); continue; }
    try {
      await db.runTransaction(async (tx) => {
        if ((await tx.get(href(db, name))).exists) throw new UErr(`@${name}: имя уже занято (его использует кто-то или оно уже в магазине)`, 409);
        tx.set(href(db, name), { premium: true, uid: null });
        tx.set(uref(db, name), { name, ownerUid: null, shopPrice: price, salePrice: null, rentPerDay: null, renterUid: null, rentUntil: null, usedBy: null, createdAt: Date.now() } satisfies UsernameDoc);
      });
      added.push(name);
    } catch (e) {
      skipped.push(name);
      if (!(e instanceof UErr)) console.error("addToShop error:", e);
      reasons.push(e instanceof UErr ? e.message : `@${name}: ошибка базы данных (${(e as Error)?.message?.slice(0, 120) ?? "?"})`);
    }
  }
  return { added, skipped, reasons };
}
