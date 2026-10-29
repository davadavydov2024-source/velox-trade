import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { PublicActivityItem } from "@/types";

const col = collection(db, "publicActivity");

/** Живая подписка на последние N покупок — для тикера на главной странице. */
export function subscribeLiveActivity(cb: (items: PublicActivityItem[]) => void, max = 20) {
  const q = query(col, orderBy("createdAt", "desc"), limit(max));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PublicActivityItem)),
    () => cb([])
  );
}
