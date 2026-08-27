import { collection, doc, getDoc, getDocs, setDoc, updateDoc, arrayUnion, onSnapshot, query, where, orderBy } from "firebase/firestore";
import { db, auth } from "./firebase";
import { TradeOffer } from "@/types";
import { notifyPush } from "./webPushNotify";
import { notifyTelegram } from "./telegramNotify";

const tradesCol = collection(db, "tradeOffers");

export interface TradeChatMessage {
  from: "fromUser" | "toUser" | "admin" | "system";
  text: string;
  createdAt: number;
}
export interface TradeChat {
  tradeId: string;
  fromUserId: string;
  toUserId: string;
  messages: TradeChatMessage[];
  updatedAt: number;
}

export const TRADE_DISCLAIMER =
  "Обмен происходит напрямую между тобой и другим игроком — Velox Trade не является стороной сделки. Соблюдение правил (передавать предмет ТОЛЬКО через бота-посредника, никогда не отдавать первым напрямую) полностью на ответственности участников; если кто-то нарушит это и потеряет предмет вне системы ботов, площадка за это не отвечает. Если что-то пошло не так — сразу напиши в поддержку: администратор может подключиться к переписке по сделке и разобраться.";

export async function createTradeOffer(params: {
  offeredProductId: string;
  requestedProductId: string;
  extraBalance?: number;
  message?: string;
}): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Нужно войти в аккаунт");
  const idToken = await currentUser.getIdToken();
  const res = await fetch("/api/trades/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Не удалось создать предложение обмена");
  return data.tradeId;
}

export async function respondToTrade(tradeId: string, action: "accept" | "reject" | "cancel"): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Нужно войти в аккаунт");
  const idToken = await currentUser.getIdToken();
  const res = await fetch("/api/trades/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ tradeId, action }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Не удалось обработать заявку");
}

/** Заявки, которые пользователю ПРЕДЛОЖИЛИ (он — владелец запрошенного товара). */
export async function getIncomingTrades(uid: string): Promise<TradeOffer[]> {
  const snap = await getDocs(query(tradesCol, where("toUserId", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TradeOffer).sort((a, b) => b.createdAt - a.createdAt);
}

/** Заявки, которые пользователь САМ отправил. */
export async function getOutgoingTrades(uid: string): Promise<TradeOffer[]> {
  const snap = await getDocs(query(tradesCol, where("fromUserId", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TradeOffer).sort((a, b) => b.createdAt - a.createdAt);
}

/** Для админки: все сделки на сайте — используется, когда нужно найти конкретный обмен по обращению в поддержку. */
export async function getAllTrades(): Promise<TradeOffer[]> {
  const snap = await getDocs(query(tradesCol, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TradeOffer);
}

export async function getTradeById(id: string): Promise<TradeOffer | null> {
  const snap = await getDoc(doc(tradesCol, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as TradeOffer) : null;
}

export function subscribeTradeChat(tradeId: string, cb: (chat: TradeChat | null) => void) {
  return onSnapshot(doc(db, "tradeChats", tradeId), (snap) => {
    cb(snap.exists() ? (snap.data() as TradeChat) : null);
  });
}

export async function sendTradeChatMessage(tradeId: string, fromUserId: string, toUserId: string, from: TradeChatMessage["from"], text: string) {
  const ref = doc(db, "tradeChats", tradeId);
  const snap = await getDoc(ref);
  const message: TradeChatMessage = { from, text, createdAt: Date.now() };

  if (!snap.exists()) {
    await setDoc(ref, { tradeId, fromUserId, toUserId, messages: [message], updatedAt: Date.now() });
  } else {
    await updateDoc(ref, { messages: arrayUnion(message), updatedAt: Date.now() });
  }

  const preview = text.length > 200 ? `${text.slice(0, 200)}…` : text;
  if (from === "fromUser" || from === "toUser") {
    const otherUid = from === "fromUser" ? toUserId : fromUserId;
    notifyTelegram(otherUid, `💬 Новое сообщение по обмену:\n${preview}`);
    notifyPush(otherUid, "Новое сообщение по обмену", preview, "/profile/trades");
  } else if (from === "admin") {
    // Администратор подключился к переписке (обычно после обращения в поддержку) — уведомляем
    // ОБОИХ участников обмена, а не только одну сторону.
    [fromUserId, toUserId].forEach((uid) => {
      notifyTelegram(uid, `👮 Администратор подключился к вашему обмену:\n${preview}`);
      notifyPush(uid, "Администратор написал в чате обмена", preview, "/profile/trades");
    });
  }
}
