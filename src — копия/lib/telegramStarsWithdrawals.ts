import { adminDb } from "./firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const MIN_STARS_WITHDRAWAL = 15;

export async function getStarsBalanceMessage(uid: string): Promise<string> {
  const snap = await adminDb().collection("users").doc(uid).get();
  const balance = snap.data()?.starsBalance ?? 0;
  if (balance < MIN_STARS_WITHDRAWAL) {
    return `⭐ Баланс Stars: ${balance} ⭐\n\nВывод доступен от ${MIN_STARS_WITHDRAWAL} ⭐ — накопится с продаж товаров, для которых ты указал цену в Stars (профиль → «Мои товары»).`;
  }
  return `⭐ Баланс Stars: ${balance} ⭐\n\nМожешь вывести всю сумму — нажми кнопку ниже.`;
}

/**
 * Создаёт заявку на вывод всего текущего starsBalance продавца и сразу его списывает (чтобы
 * нельзя было запросить вывод дважды за одни и те же звёзды, пока заявка ещё не рассмотрена).
 * При отклонении администратором сумма возвращается обратно (см. rejectStarsWithdrawalFromBot
 * в telegramAdminPanel.ts). Возвращает текст для ответа пользователю в боте.
 */
export async function requestStarsWithdrawal(uid: string, userNick: string): Promise<string> {
  const db = adminDb();
  const userRef = db.collection("users").doc(uid);

  // Не даём заявке уйти, если у продавца уже есть необработанная — иначе он мог бы наплодить
  // заявок и запутать администратора (списание всё равно защищает от двойного вывода суммы, но
  // повторные заявки на 0 ⭐ выглядели бы как спам).
  const existingPending = await db.collection("starsWithdrawals").where("sellerId", "==", uid).where("status", "==", "pending").limit(1).get();
  if (!existingPending.empty) {
    return "У тебя уже есть заявка на вывод Stars в обработке — дождись решения администратора.";
  }

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const balance = snap.data()?.starsBalance ?? 0;
    if (balance < MIN_STARS_WITHDRAWAL) {
      throw new Error("too-low");
    }
    tx.update(userRef, { starsBalance: FieldValue.increment(-balance) });
    const ref = db.collection("starsWithdrawals").doc();
    tx.set(ref, {
      sellerId: uid,
      sellerNick: userNick,
      amountStars: balance,
      status: "pending",
      createdAt: Date.now(),
    });
    return balance;
  }).catch((err) => {
    if (err?.message === "too-low") return null;
    throw err;
  });

  if (result === null) {
    return `Вывод доступен от ${MIN_STARS_WITHDRAWAL} ⭐ — у тебя сейчас меньше.`;
  }
  return `✅ Заявка на вывод ${result} ⭐ отправлена администратору — жди подтверждения.`;
}
