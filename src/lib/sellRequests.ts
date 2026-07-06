import { collection, addDoc, getDocs, query, doc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { SellRequest } from "@/types";

const sellRequestsCol = collection(db, "sellRequests");

export async function createSellRequest(data: Omit<SellRequest, "id" | "createdAt" | "status">) {
  return addDoc(sellRequestsCol, { ...data, status: "pending", createdAt: Date.now() });
}

export async function getAllSellRequests(): Promise<SellRequest[]> {
  const snap = await getDocs(query(sellRequestsCol));
  const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SellRequest);
  return requests.sort((a, b) => b.createdAt - a.createdAt);
}

export async function setSellRequestStatus(id: string, status: "approved" | "rejected") {
  return updateDoc(doc(db, "sellRequests", id), { status });
}
