import { collection, addDoc, getDocs, getDoc, doc, updateDoc, query, where, orderBy, increment, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { TicketRequest } from "@/types";
import { notifyTelegram, notifyAdminTelegram } from "./telegramNotify";
import { notifyPush } from "./webPushNotify";

const col = collection(db, "ticketRequests");

export async function createTicketRequest(userId: string, userNick: string, photoUrl: string, description: string) {
  const ref = await addDoc(col, {
    userId,
    userNick,
    photoUrl,
    description,
    status: "pending",
    createdAt: Date.now(),
  });
  notifyAdminTelegram(`🎫 Новая заявка на сдачу предмета за тикеты от ${userNick}`);
  return ref;
}

export async function getMyTicketRequests(uid: string): Promise<TicketRequest[]> {
  const snap = await getDocs(query(col, where("userId", "==", uid)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as TicketRequest)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAllTicketRequests(): Promise<TicketRequest[]> {
  const snap = await getDocs(query(col, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TicketRequest);
}

/** Админ предлагает сумму тикетов за присланный предмет. */
export async function offerTickets(request: TicketRequest, tickets: number) {
  await updateDoc(doc(db, "ticketRequests", request.id), { status: "offered", offeredTickets: tickets });
  notifyTelegram(request.userId, `🎫 За твой предмет предложили ${tickets} тикетов — зайди в «Тикеты» в профиле, чтобы согласиться или отказаться.`);
  notifyPush(request.userId, "Предложение по тикетам", `${tickets} 🎫 за твой предмет`, "/profile/tickets", "messages");
}

/**
 * Пользователь соглашается на предложение — открывает (или переиспользует существующую) личную
 * переписку с админом, где дальше уже словами обсуждают, как и куда фактически передать предмет
 * (это происходит в самой игре, не на сайте). id переписки строим так же, как в
 * lib/directMessages.ts (conversationId), чтобы это была та же самая ЛС, если она уже была.
 */
export async function acceptTicketOffer(request: TicketRequest, adminUid: string) {
  const convId = [request.userId, adminUid].sort().join("_");
  const convRef = doc(db, "directConversations", convId);
  const convSnap = await getDoc(convRef);
  if (!convSnap.exists()) {
    await setDoc(convRef, {
      participants: [request.userId, adminUid],
      participantNames: { [request.userId]: request.userNick, [adminUid]: "Администратор" },
      participantPhotos: { [request.userId]: null, [adminUid]: null },
      messages: [
        {
          from: "system",
          text: `🎫 Сделка по предмету на фото — договоритесь, как передать его администратору. После получения тикеты зачислятся автоматически.`,
          createdAt: Date.now(),
        },
      ],
      updatedAt: Date.now(),
      lastMessage: "Сделка по предмету открыта",
    });
  }
  await updateDoc(doc(db, "ticketRequests", request.id), { status: "accepted", dmConversationId: convId });
  notifyAdminTelegram(`✅ ${request.userNick} согласился(-лась) на ${request.offeredTickets} 🎫 — договоритесь в личных сообщениях.`);
  return convId;
}

export async function declineTicketOffer(request: TicketRequest) {
  await updateDoc(doc(db, "ticketRequests", request.id), { status: "declined", resolvedAt: Date.now() });
}

export async function rejectTicketRequest(request: TicketRequest) {
  await updateDoc(doc(db, "ticketRequests", request.id), { status: "rejected", resolvedAt: Date.now() });
  notifyTelegram(request.userId, "❌ Заявка на сдачу предмета за тикеты отклонена.");
}

/** Админ подтверждает, что предмет реально получен (в игре) — только теперь зачисляются тикеты. */
export async function completeTicketRequest(request: TicketRequest) {
  if (!request.offeredTickets) throw new Error("no-offer");
  await updateDoc(doc(db, "users", request.userId), { ticketBalance: increment(request.offeredTickets) });
  await updateDoc(doc(db, "ticketRequests", request.id), { status: "completed", resolvedAt: Date.now() });
  notifyTelegram(request.userId, `🎉 Получили твой предмет — начислили ${request.offeredTickets} 🎫! Можно открывать кейсы.`);
  notifyPush(request.userId, "Тикеты зачислены", `+${request.offeredTickets} 🎫`, "/case", "messages");
}
