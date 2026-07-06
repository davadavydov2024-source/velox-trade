import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { db } from "./firebase";
import { SupportTicket, TicketMessage } from "@/types";

const ticketsCol = collection(db, "tickets");

export async function createTicket(data: {
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
}) {
  const now = Date.now();
  const firstMessage: TicketMessage = { from: "user", text: data.message, createdAt: now };
  return addDoc(ticketsCol, {
    userId: data.userId,
    userName: data.userName,
    userEmail: data.userEmail,
    subject: data.subject,
    status: "open",
    messages: [firstMessage],
    createdAt: now,
    updatedAt: now,
  });
}

export async function getUserTickets(userId: string): Promise<SupportTicket[]> {
  // Без orderBy здесь намеренно: where + orderBy на разных полях требует составного индекса
  // в Firestore, который нужно вручную создавать в консоли. Сортируем на клиенте — данных мало,
  // это надёжнее, чем заставлять администратора настраивать индекс.
  const snap = await getDocs(query(ticketsCol, where("userId", "==", userId)));
  const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SupportTicket);
  return tickets.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getAllTickets(): Promise<SupportTicket[]> {
  const snap = await getDocs(query(ticketsCol, orderBy("updatedAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SupportTicket);
}

export async function getTicket(id: string): Promise<SupportTicket | null> {
  const snap = await getDoc(doc(db, "tickets", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as SupportTicket;
}

export async function addTicketMessage(id: string, from: "user" | "admin", text: string) {
  const message: TicketMessage = { from, text, createdAt: Date.now() };
  return updateDoc(doc(db, "tickets", id), {
    messages: arrayUnion(message),
    updatedAt: Date.now(),
    status: from === "admin" ? "answered" : "open",
  });
}

export async function setTicketStatus(id: string, status: SupportTicket["status"]) {
  return updateDoc(doc(db, "tickets", id), { status, updatedAt: Date.now() });
}
