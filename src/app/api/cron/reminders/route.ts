import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";
import { finishExpiredContests } from "@/lib/telegramContests";

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
  let auctionReminders = 0;

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
      await sendWebPush(p.sellerId, { title: "Буст товара закончился", body: `«${p.name}» — поднимите снова`, url: "/profile/my-products" }, "reminders");
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
      await sendWebPush(cart.uid, { title: "Забыли о корзине?", body: itemsList, url: "/cart" }, "reminders");
      await doc.ref.update({ reminderSentAt: now });
      cartReminders++;
    }
  } catch (err) {
    console.error("cron cart reminder error:", err);
  }

  // --- Аукцион со ставками идёт больше 24 часов без завершения — деньги лидера всё это время
  // держатся заблокированными (held), поэтому продавцу настойчиво напоминаем не откладывать.
  // Автоматически НЕ завершаем — момент окончания торгов сознательно оставлен на усмотрение
  // продавца (см. api/auctions/end), тут только напоминание раз в 24 часа, пока он не завершит.
  try {
    const auctionsSnap = await db.collection("products").where("auctionStatus", "==", "active").get();
    for (const doc of auctionsSnap.docs) {
      const p = doc.data();
      if (!p.auctionEnabled || !p.auctionBidCount) continue;
      const createdAt = p.createdAt as number;
      const lastReminderAt = (p.auctionReminderSentAt as number | undefined) ?? createdAt;
      if (now - lastReminderAt < 24 * HOUR) continue;

      await notifyTelegramServer(
        p.sellerId,
        `🔨 Аукцион «${p.name}» идёт уже больше суток (${p.auctionBidCount} ставок, текущая ${p.auctionCurrentPrice} ₽). Деньги лидера заблокированы, пока ты не завершишь торги — не забудь про это в личном кабинете.`
      );
      await sendWebPush(p.sellerId, { title: "Аукцион ждёт завершения", body: `«${p.name}» — ${p.auctionCurrentPrice} ₽, ${p.auctionBidCount} ставок`, url: `/product/${doc.id}` }, "reminders");
      await doc.ref.update({ auctionReminderSentAt: now });
      auctionReminders++;
    }
  } catch (err) {
    console.error("cron auction reminder error:", err);
  }

  // Подстраховка на случай, если ни один участник не нажал кнопку "Участвовать" после истечения
  // срока конкурса (тогда ленивая проверка в handleContestJoin не сработала бы) — раз в сутки
  // (единственная периодичность, доступная на Hobby-тарифе Vercel) добираем все просроченные.
  try {
    await finishExpiredContests();
  } catch (err) {
    console.error("cron finishExpiredContests error:", err);
  }

  return NextResponse.json({ ok: true, boostReminders, cartReminders, auctionReminders });
}
