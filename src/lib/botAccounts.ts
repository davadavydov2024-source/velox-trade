import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { BotAccount } from "@/types";

const col = collection(db, "botAccounts");

export async function getBotAccounts(): Promise<BotAccount[]> {
  const snap = await getDocs(query(col, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BotAccount);
}

/** Активные (готовые принимать предметы) боты для конкретной игры — используется при назначении бота на выдачу. */
export async function getActiveBotAccountsForGame(gameId: string): Promise<BotAccount[]> {
  const snap = await getDocs(query(col, where("gameId", "==", gameId), where("active", "==", true)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BotAccount);
}

export async function createBotAccount(data: Omit<BotAccount, "id" | "createdAt">) {
  return addDoc(col, { ...data, createdAt: Date.now() });
}

export async function updateBotAccount(id: string, changes: Partial<BotAccount>) {
  return updateDoc(doc(db, "botAccounts", id), changes);
}

export async function deleteBotAccount(id: string) {
  return deleteDoc(doc(db, "botAccounts", id));
}
