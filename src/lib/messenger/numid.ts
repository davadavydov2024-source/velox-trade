import { adminDb } from "@/lib/firebaseAdmin";

/** Числовой идентификатор аккаунта (ID: 100000, 100001…). Выдаётся один раз по порядку, у уже существующих аккаунтов — при следующем входе. */
export async function ensureNumId(uid: string): Promise<number | null> {
  const db = adminDb();
  const accRef = db.collection("messengerAccounts").doc(uid);
  const metaRef = db.collection("messengerMeta").doc("counters");
  try {
    return await db.runTransaction(async (tx) => {
      const [a, m] = await Promise.all([tx.get(accRef), tx.get(metaRef)]);
      const have = a.data()?.numId as number | undefined;
      if (have || !a.exists) return have ?? null;
      const next = ((m.data()?.numId as number | undefined) ?? 99_999) + 1;
      tx.set(metaRef, { numId: next }, { merge: true });
      tx.update(accRef, { numId: next });
      return next;
    });
  } catch (e) {
    console.error("ensureNumId error:", e);
    return null;
  }
}
