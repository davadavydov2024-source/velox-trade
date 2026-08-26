import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Запускается часто (см. vercel.json → crons, рекомендуется раз в час — 48-часовой холд не
 * требует секундной точности, но и раз в сутки слишком грубо: деньги могли бы задерживаться
 * почти на лишний день). Ищет все PendingPayout, у которых releaseAt уже наступил и статус всё
 * ещё "holding" (не отменён спором — см. lib/disputes.ts → resolveDispute), и зачисляет сумму
 * на баланс продавца. Защищено тем же CRON_SECRET, что и остальные cron-роуты.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const db = adminDb();
  const now = Date.now();
  let released = 0;
  let failed = 0;

  try {
    const dueSnap = await db.collection("pendingPayouts").where("status", "==", "holding").where("releaseAt", "<=", now).get();

    for (const doc of dueSnap.docs) {
      const payout = doc.data();
      try {
        await db.runTransaction(async (tx) => {
          // Перечитываем внутри транзакции — на случай если resolveDispute отменил выплату
          // ровно между where()-запросом выше и этой обработкой (гонка маловероятна, но дёшево
          // защититься).
          const freshSnap = await tx.get(doc.ref);
          if (!freshSnap.exists || freshSnap.data()?.status !== "holding") return;

          tx.update(db.collection("users").doc(payout.sellerId), { balance: FieldValue.increment(payout.amount) });
          tx.update(doc.ref, { status: "released", releasedAt: now });
        });

        notifyTelegramServer(payout.sellerId, `💰 ${payout.amount} ₽ за продажу зачислены на баланс — холд закончился.`);
        sendWebPush(payout.sellerId, { title: "Деньги зачислены", body: `${payout.amount} ₽ доступны на балансе`, url: "/profile/topup" }, "purchases");
        released++;
      } catch (err) {
        console.error(`release-payouts error for ${doc.id}:`, err);
        failed++;
      }
    }
  } catch (err) {
    console.error("release-payouts query error:", err);
  }

  return NextResponse.json({ ok: true, released, failed });
}
