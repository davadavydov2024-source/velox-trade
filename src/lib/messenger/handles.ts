import { adminDb } from "@/lib/firebaseAdmin";
import { HANDLE_RE, RESERVED_HANDLES } from "./server";

/**
 * Смена @юзернейма, как в Telegram: проверка «свободно / занято / нельзя» и сама смена.
 * messengerHandles/{имя}: { uid } — занято; { premium: true } — коллекционное (покупается в магазине юзернеймов).
 * Пока на аккаунте включено коллекционное имя, обычное хранится в baseHandle — меняем именно его.
 */
export type HandleStatus = "ok" | "same" | "invalid" | "taken" | "reserved" | "bot" | "collectible";
export interface HandleCheck { status: HandleStatus; message: string }

export class HandleError extends Error { constructor(m: string, public status = 400) { super(m); } }

export const normalizeHandle = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/^@/, "");

/** Проверка записи имени без обращения к базе. Правила как в Telegram: a–z, 0–9, _; от буквы; от 4 символов. */
export function handleSyntax(h: string): HandleCheck | null {
  const bad = (message: string): HandleCheck => ({ status: "invalid", message });
  if (h.length < 4) return bad("Имя слишком короткое: минимум 4 символа");
  if (h.length > 24) return bad("Имя слишком длинное: максимум 24 символа");
  if (/[^a-z0-9_]/.test(h)) return bad("Можно использовать только латиницу a–z, цифры и _");
  if (!/^[a-z]/.test(h)) return bad("Имя должно начинаться с буквы");
  if (h.endsWith("_")) return bad("Имя не может заканчиваться на _");
  if (h.includes("__")) return bad("Нельзя ставить два _ подряд");
  if (!HANDLE_RE.test(h)) return bad("Некорректное имя");
  if (h.endsWith("bot")) return { status: "bot", message: "Имена на «bot» зарезервированы для ботов" };
  if (RESERVED_HANDLES.has(h)) return { status: "reserved", message: "Это имя недоступно" };
  return null;
}

async function currentHandle(uid: string): Promise<string> {
  const a = (await adminDb().collection("messengerAccounts").doc(uid).get()).data();
  return (a?.baseHandle as string | undefined) ?? (a?.handle as string | undefined) ?? "";
}

export async function checkHandle(uid: string, raw: unknown): Promise<HandleCheck & { current: string }> {
  const h = normalizeHandle(raw);
  const current = await currentHandle(uid);
  if (h === current) return { status: "same", message: "Это ваше текущее имя", current };
  const bad = handleSyntax(h);
  if (bad) return { ...bad, current };
  const d = (await adminDb().collection("messengerHandles").doc(h).get()).data();
  if (d?.premium) return { status: "collectible", message: "Это коллекционный юзернейм — его можно купить в магазине юзернеймов", current };
  if (d) return { status: "taken", message: "Это имя уже занято", current };
  return { status: "ok", message: `@${h} свободно`, current };
}

/** Меняет @юзернейм: занимает новое имя и освобождает старое одной транзакцией. */
export async function changeHandle(uid: string, raw: unknown): Promise<string> {
  const next = normalizeHandle(raw);
  const bad = handleSyntax(next);
  if (bad) throw new HandleError(bad.message);
  const db = adminDb();
  const accRef = db.collection("messengerAccounts").doc(uid);
  const nextRef = db.collection("messengerHandles").doc(next);
  await db.runTransaction(async (tx) => {
    const acc = (await tx.get(accRef)).data();
    if (!acc) throw new HandleError("Аккаунт не найден", 404);
    const cur = (acc.baseHandle as string | undefined) ?? (acc.handle as string);
    if (cur === next) throw new HandleError("Это ваше текущее имя");
    const curRef = db.collection("messengerHandles").doc(cur);
    const [n, c] = await Promise.all([tx.get(nextRef), tx.get(curRef)]);
    if (n.exists) throw new HandleError(n.data()?.premium ? "Это коллекционный юзернейм — его можно купить в магазине" : "Это имя уже занято", 409);
    tx.set(nextRef, { uid });
    if (c.exists && !c.data()?.premium && c.data()?.uid === uid) tx.delete(curRef); // старое имя освобождается
    tx.update(accRef, acc.premiumHandle ? { baseHandle: next } : { handle: next });
  });
  return next;
}
