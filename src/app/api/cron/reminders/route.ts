import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";
export const maxDuration = 60;

const HOUR = 60 * 60 * 1000;

/**
 * Раз в день (см. vercel.json → crons): напоминает продавцам, что буст товара кончился,
 * и покупателям — что в корзине что-то лежит и ждёт оформления. Защищено секретом в заголовке,
 * чтобы этот роут не мог дёрнуть кто попало — Vercel Cron сам подставляет его при вызове.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const db = adminDb();
  const now = Date.now();
  let boostReminders = 0;
  let cartReminders = 0;

  // --- Буст закончился в последние 24 часа и продавцу ещё не напоминали ---
  try {
    const boostedSnap = await db
      .collection("products")
      .where("boostUntil", ">", 0)
      .get();

    for (const doc of boostedSnap.docs) {
      const p = doc.data();
      const boostUntil = p.boostUntil as number;
      const alreadyReminded = (p.boostReminderSentFor as number | undefined) === boostUntil;
      if (boostUntil > now || boostUntil < now - 24 * HOUR || alreadyReminded) continue;

      await notifyTelegramServer(p.sellerId, `⏳ Буст товара «${p.name}» закончился — можно поднять снова в личном кабинете.`);
      await sendWebPush(p.sellerId, { title: "Буст товара закончился", body: `«${p.name}» — поднимите снова`, url: "/profile/my-products" });
      await doc.ref.update({ boostReminderSentFor: boostUntil });
      boostReminders++;
    }
  } catch (err) {
    console.error("cron boost reminder error:", err);
  }

  // --- Брошенные корзины: лежит 2-24 часа без изменений и ещё не напоминали ---
  try {
    const cartsSnap = await db.collection("carts").get();
    for (const doc of cartsSnap.docs) {
      const cart = doc.data();
      const updatedAt = cart.updatedAt as number;
      const alreadyReminded = (cart.reminderSentAt as number | undefined) ?? 0;
      const idleFor = now - updatedAt;
      if (idleFor < 2 * HOUR || idleFor > 24 * HOUR || alreadyReminded > updatedAt) continue;

      const itemsList = (cart.items as { name: string }[]).map((i) => i.name).join(", ");
      await notifyTelegramServer(cart.uid, `🛒 В корзине ждут: ${itemsList}. Не забудьте оформить заказ!`);
      await sendWebPush(cart.uid, { title: "Забыли о корзине?", body: itemsList, url: "/cart" });
      await doc.ref.update({ reminderSentAt: now });
      cartReminders++;
    }
  } catch (err) {
    console.error("cron cart reminder error:", err);
  }

  return NextResponse.json({ ok: true, boostReminders, cartReminders });
}
