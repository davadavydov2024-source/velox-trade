"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useAuth } from "./authContext";
import { subscribeUserOrderChats } from "./orderChats";
import { subscribeUserConversations } from "./directMessages";
import { subscribeUserTickets } from "./tickets";
import { countUnread } from "./chatRead";
import { OrderChat, OrderChatMessage, DirectConversation, DirectMessage, SupportTicket, TicketMessage } from "@/types";

export interface UnreadState {
  total: number;
  /** orderId -> число непрочитанных */
  byOrder: Record<string, number>;
  /** uid собеседника -> число непрочитанных */
  byDm: Record<string, number>;
  support: number;
  /** Живые чаты по сделкам (для списка в «Чатах») */
  orderChats: OrderChat[];
}

const EMPTY: UnreadState = { total: 0, byOrder: {}, byDm: {}, support: 0, orderChats: [] };
const UnreadContext = createContext<UnreadState>(EMPTY);

/** Одна общая подписка на чаты/личные/тикеты — из неё берут бейджи шапка, нижняя панель и страница «Чаты». */
export function UnreadProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [orderChats, setOrderChats] = useState<OrderChat[]>([]);
  const [dms, setDms] = useState<DirectConversation[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  useEffect(() => {
    if (!user) {
      setOrderChats([]);
      setDms([]);
      setTickets([]);
      return;
    }
    const u1 = subscribeUserOrderChats(user.uid, setOrderChats);
    const u2 = subscribeUserConversations(user.uid, setDms);
    const u3 = subscribeUserTickets(user.uid, setTickets);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [user]);

  const value = useMemo<UnreadState>(() => {
    if (!user) return EMPTY;
    const me = user.uid;
    const byOrder: Record<string, number> = {};
    for (const c of orderChats) {
      const n = countUnread<OrderChatMessage>(
        c.messages ?? [],
        (m) => m.from !== "system" && !((m.from === "buyer" && c.buyerId === me) || (m.from === "seller" && c.sellerId === me)),
        c.readBy?.[me]
      );
      if (n > 0) byOrder[c.orderId] = n;
    }
    const byDm: Record<string, number> = {};
    for (const c of dms) {
      const peer = c.participants.find((p) => p !== me);
      if (!peer) continue;
      const n = countUnread<DirectMessage>(c.messages ?? [], (m) => m.from !== me, c.readBy?.[me]);
      if (n > 0) byDm[peer] = n;
    }
    let support = 0;
    for (const t of tickets) support += countUnread<TicketMessage>(t.messages ?? [], (m) => m.from === "admin", t.readBy?.[me]);

    const sum = (r: Record<string, number>) => Object.values(r).reduce((a: number, b: number) => a + b, 0);
    const total = sum(byOrder) + sum(byDm) + support;
    return { total, byOrder, byDm, support, orderChats };
  }, [user, orderChats, dms, tickets]);

  return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export function useUnread() {
  return useContext(UnreadContext);
}
