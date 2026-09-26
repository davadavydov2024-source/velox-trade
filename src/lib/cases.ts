import { collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { CaseData, CaseItem } from "@/types";

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
