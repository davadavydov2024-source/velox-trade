import { adminDb } from "./firebaseAdmin";

const STATUS_LABEL: Record<string, string> = {
  pending_confirmation: "Ожидает подтверждения",
  confirmed: "Подтверждён",
  disputed: "Спор открыт",
  cancelled: "Отменён",
};

/** По chatId находит uid — обратный поиск к telegramLinks (который хранится как {uid}: {chatId}). */
export async function findUidByChatId(chatId: number): Promise<string | null> {
  const snap = await adminDb().collection("telegramLinks").where("chatId", "==", chatId).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

export async function getBalanceMessage(uid: string): Promise<string> {
  const snap = await adminDb().collection("users").doc(uid).get();
  const balance = snap.data()?.balance ?? 0;
  return `💰 Твой баланс: ${balance} ₽`;
}

export async function getRecentOrdersMessage(uid: string): Promise<string> {
  const snap = await adminDb().collection("orders").where("userId", "==", uid).get();
  const orders = snap.docs
    .map((d) => d.data() as { items: { name: string; quantity: number }[]; total: number; status: string; createdAt: number })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  if (orders.length === 0) return "У тебя пока нет заказов.";

  const lines = orders.map((o) => {
    const items = o.items.map((i) => `${i.name} ×${i.quantity}`).join(", ");
    return `📦 ${items}\n${o.total} ₽ — ${STATUS_LABEL[o.status] ?? o.status}`;
  });
  return `Последние заказы:\n\n${lines.join("\n\n")}`;
}
