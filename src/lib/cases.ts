import { collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, query, orderBy, where } from "firebase/firestore";
import { db } from "./firebase";
import { CaseData, CaseItem, CaseOpening, Rarity } from "@/types";

const casesCol = collection(db, "cases");

export async function getAllCases(): Promise<CaseData[]> {
  const snap = await getDocs(query(casesCol, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CaseData);
}

/** Только видимые (active) кейсы — для публичной страницы /case. Фильтруем на клиенте, а не
 * через Firestore where, чтобы не заводить лишний индекс ради одного простого списка. */
export async function getActiveCases(): Promise<CaseData[]> {
  const all = await getAllCases();
  return all.filter((c) => c.active);
}

export async function getCaseById(id: string): Promise<CaseData | null> {
  const snap = await getDoc(doc(db, "cases", id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as CaseData) : null;
}

export async function createCase(data: Omit<CaseData, "id" | "createdAt" | "items">) {
  return addDoc(casesCol, { ...data, items: [], createdAt: Date.now() });
}

export async function updateCase(id: string, changes: Partial<Omit<CaseData, "id" | "items">>) {
  return updateDoc(doc(db, "cases", id), changes);
}

export async function deleteCase(id: string) {
  return deleteDoc(doc(db, "cases", id));
}

/** Предметы хранятся массивом прямо в документе кейса (не отдельной коллекцией) — их обычно
 * немного (пара-десяток на кейс), а так админке достаточно одного чтения/записи на весь список. */
export async function setCaseItems(caseId: string, items: CaseItem[]) {
  return updateDoc(doc(db, "cases", caseId), { items });
}

/** История открытий конкретного пользователя — для /profile/case-history. Сортируем на клиенте,
 * а не через Firestore orderBy, чтобы не заводить составной индекс (userId + createdAt) ради
 * одного простого списка. */
export async function getMyCaseOpenings(uid: string, max = 100): Promise<CaseOpening[]> {
  const snap = await getDocs(query(collection(db, "caseOpenings"), where("userId", "==", uid)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as CaseOpening)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, max);
}

/**
 * Редкость предмета считаем не по цене (у приза теперь нет своей "стоимости в тикетах" — это
 * реальный товар), а по его реальному шансу выпадения относительно остальных предметов кейса.
 * Это даже честнее: вероятность и ЕСТЬ редкость — чем реже выпадает, тем выше тир, ровно как в
 * настоящих кейсах. Шкала общая с каталогом/ачивками (см. lib/rarityColors.ts).
 */
export function getCaseItemRarity(weight: number, totalWeight: number): Rarity {
  const chance = totalWeight > 0 ? weight / totalWeight : 0;
  if (chance <= 0.02) return "legendary";
  if (chance <= 0.06) return "epic";
  if (chance <= 0.15) return "rare";
  if (chance <= 0.35) return "uncommon";
  return "common";
}
