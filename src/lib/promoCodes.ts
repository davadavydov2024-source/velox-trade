import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, where, arrayUnion } from "firebase/firestore";
import { db } from "./firebase";
import { PromoCode } from "@/types";
import { adjustUserBalance, createOrder } from "./users";

const promoCol = collection(db, "promoCodes");

export async function getAllPromoCodes(): Promise<PromoCode[]> {
  const snap = await getDocs(promoCol);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PromoCode).sort((a, b) => b.createdAt - a.createdAt);
}

export async function createPromoCode(data: Omit<PromoCode, "id" | "usedBy" | "createdAt">) {
  return addDoc(promoCol, { ...data, code: data.code.trim().toUpperCase(), usedBy: [], createdAt: Date.now() });
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

/** Проверяет и сразу выдаёт промо-подарок (баланс или предмет), помечая код использованным. */
export async function redeemGiftCode(code: string, uid: string): Promise<PromoCode> {
  const promo = await findByCode(code);
  if (!promo || promo.type !== "gift") throw new Error("Промокод не найден");
  const err = checkUsable(promo, uid);
  if (err) throw new Error(err);

  if (promo.giftType === "balance" && promo.giftBalance) {
    await adjustUserBalance(uid, promo.giftBalance);
  } else if (promo.giftType === "product" && promo.giftProductId) {
    await createOrder({
      userId: uid,
      sellerId: "store",
      items: [{ productId: promo.giftProductId, name: promo.giftProductName ?? "Промо-подарок", price: 0, quantity: 1 }],
      total: 0,
      status: "confirmed",
      confirmedAt: Date.now(),
    });
  }

  await markPromoCodeUsed(promo.id, uid);
  return promo;
}
