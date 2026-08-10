import { collection, doc, getDocs, addDoc, deleteDoc, orderBy, query } from "firebase/firestore";
import { db } from "./firebase";
import { NewsPost } from "@/types";

const newsCol = collection(db, "newsPosts");

export async function getNewsPosts(): Promise<NewsPost[]> {
  const snap = await getDocs(query(newsCol, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as NewsPost);
}

export async function createNewsPost(data: Omit<NewsPost, "id" | "createdAt">) {
  return addDoc(newsCol, { ...data, createdAt: Date.now() });
}

export async function deleteNewsPost(id: string) {
  return deleteDoc(doc(db, "newsPosts", id));
}
