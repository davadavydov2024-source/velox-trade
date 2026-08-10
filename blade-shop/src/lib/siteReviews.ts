import { collection, addDoc, getDocs, query, orderBy, doc, deleteDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { SiteReview } from "@/types";

const siteReviewsCol = collection(db, "siteReviews");

export async function getSiteReviews(): Promise<SiteReview[]> {
  const snap = await getDocs(query(siteReviewsCol, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SiteReview);
}

export async function hasUserReviewedSite(userId: string): Promise<boolean> {
  const snap = await getDocs(query(siteReviewsCol, where("userId", "==", userId)));
  return !snap.empty;
}

export async function createSiteReview(data: Omit<SiteReview, "id" | "createdAt">) {
  return addDoc(siteReviewsCol, { ...data, createdAt: Date.now() });
}

export async function deleteSiteReview(id: string) {
  return deleteDoc(doc(db, "siteReviews", id));
}
