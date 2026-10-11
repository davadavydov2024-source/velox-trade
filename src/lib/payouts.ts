import { adminDb } from "./firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { notifyTelegramServer } from "./telegramNotifyServer";
import { sendWebPush } from "./webPushServer";

/** Сколько деньги лежат в холде после подтверждения покупателем (как на PlayerOK). */
export const HOLD_DURATION_MS = 48 * 60 * 60 * 1000;

/**
 * Зачисляет на баланс продавцов все выплаты, у которых холд уже закончился.
 *
 * Запрос ТОЛЬКО по равенствам (status [+ sellerId]), а время releaseAt проверяем в памяти: раньше был
 * запрос status == holding И releaseAt <= now, а он требует составного индекса Firestore — без индекса
 * запрос падал, ошибка глоталась, и деньги продавцов не выплачивались никогда.
 *
 * Идемпотентно: статус перечитывается внутри транзакции, повторный запуск (крон + «ленивый» вызов из
 * профиля одновременно) не зачислит одну и ту же выплату дважды.
 */
export async function releaseDuePayouts(opts: { sellerId?: string } = {}): Promise<{ released: number; failed: number }> {
  const db = adminDb();
  const now = Date.now();
  let released = 0;
  let failed = 0;

  let q = db.collection("pendingPayouts").where("status", "==", "holding");
  if (opts.sellerId) q = q.where("sellerId", "==", opts.sellerId);
  const snap = await q.limit(500).get();

  for (const doc of snap.docs) {
    const payout = doc.data();
    if ((payout.releaseAt ?? Infinity) > now) continue;
    try {
      const done = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (!fresh.exists || fresh.data()?.status !== "holding") return false;
        tx.set(db.collection("users").doc(payout.sellerId), { balance: FieldValue.increment(payout.amount) }, { merge: true });
        tx.update(doc.ref, { status: "released", releasedAt: now });
        return true;
      });
      if (!done) continue;
      notifyTelegramServer(payout.sellerId, `💰 ${payout.amount} ₽ за продажу зачислены на баланс — холд закончился.`);
      sendWebPush(payout.sellerId, { title: "Деньги зачислены", body: `${payout.amount} ₽ доступны на балансе`, url: "/profile" }, "purchases");
      released++;
    } catch (err) {
      console.error(`releaseDuePayouts error for ${doc.id}:`, err);
      failed++;
    }
  }
  return { released, failed };
}
