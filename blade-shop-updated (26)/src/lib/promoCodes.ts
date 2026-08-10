import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, where, arrayUnion } from "firebase/firestore";
import { db, auth } from "./firebase";
import { PromoCode } from "@/types";

const promoCol = collection(db, "promoCodes");

export async function getAllPromoCodes(): Promise<PromoCode[]> {
  const snap = await getDocs(promoCol);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PromoCode).sort((a, b) => b.createdAt - a.createdAt);
}

export async function createPromoCode(data: Omit<PromoCode, "id" | "usedBy" | "createdAt">) {
  // Firestore addDoc() падает с ошибкой, если хоть одно поле объекта — undefined (а не отсутствует).
  // Чистим на всякий случай, независимо от того, что именно передал вызывающий код.
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  return addDoc(promoCol, { ...clean, code: data.code.trim().toUpperCase(), usedBy: [], createdAt: Date.now() });
}

export async function updatePromoCode(id: string, changes: Partial<PromoCode>) {
  return updateDoc(doc(db, "promoCodes", id), changes);
}

export async function deletePromoCode(id: string) {
  return deleteDoc(doc(db, "promoCodes", id));
}

async function findByCode(code: string): Promise<PromoCode | null> {
  const norm = code.trim().toUpperCase();
  if (!norm) return null;
  const snap = await getDocs(query(promoCol, where("code", "==", norm)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as PromoCode;
}

/** Возвращает текст ошибки, если код нельзя использовать прямо сейчас, иначе null. */
function checkUsable(promo: PromoCode, uid: string): string | null {
  if (!promo.active) return "Промокод неактивен";
  if (promo.expiresAt && Date.now() > promo.expiresAt) return "Срок действия промокода истёк";
  if (promo.usedBy.includes(uid)) return "Вы уже использовали этот промокод";
  if (promo.maxUses != null && promo.usedBy.length >= promo.maxUses) return "Лимит активаций промокода исчерпан";
  return null;
}

export async function markPromoCodeUsed(id: string, uid: string) {
  return updateDoc(doc(db, "promoCodes", id), { usedBy: arrayUnion(uid) });
}

/** Проверяет скидочный промокод (для корзины), но НЕ отмечает его использованным — это делается после успешной оплаты. */
export async function validateDiscountCode(code: string, uid: string): Promise<PromoCode> {
  const promo = await findByCode(code);
  if (!promo || promo.type !== "discount") throw new Error("Промокод не найден");
  const err = checkUsable(promo, uid);
  if (err) throw new Error(err);
  return promo;
}

/**
 * Проверяет и сразу выдаёт промо-подарок (баланс или предмет), помечая код использованным.
 * Идёт через сервер (api/promo/redeem-gift), потому что обычный пользователь не может ни менять
 * свой баланс напрямую (запрещают правила Firestore), ни списывать остаток чужого товара.
 */
export async function redeemGiftCode(code: string, uid: string): Promise<{ giftType: "balance" | "product"; giftBalance?: number; giftProductName?: string }> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Нужно войти в аккаунт");
  const res = await fetch("/api/promo/redeem-gift", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Не удалось активировать промокод");
  return data;
}
