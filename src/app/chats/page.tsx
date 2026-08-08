"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { LifeBuoy, Megaphone, ShieldCheck, ChevronLeft, MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getUserOrderChats } from "@/lib/orderChats";
import { getUserProfile, getOrderById } from "@/lib/users";
import { getProductById } from "@/lib/products";
import { safeImageSrc } from "@/lib/safeImage";
import { SupportPanel } from "@/components/SupportPanel";
import { NewsPanel } from "@/components/NewsPanel";
import { OrderChatThread } from "@/components/OrderChatThread";

type ChatView = { kind: "support" } | { kind: "news" } | { kind: "order"; orderId: string; counterpartName: string };

interface ChatListItem {
  orderId: string;
  counterpartName: string;
  lastMessage: string;
  updatedAt: number;
  itemImage: string | null;
}

const AVATAR_COLORS = ["#ff9800", "#4a6cf7", "#22c55e", "#e879f9", "#38bdf8", "#f87171"];

function avatarColor(name: string) {
  const sum = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function formatWhen(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "вчера";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function itemClasses(active: boolean) {
  return `w-full flex items-center gap-3 p-2.5 rounded-btn text-left transition-colors ${
    active ? "bg-accent/15" : "hover:bg-white/5"
  }`;
}

function ChatsInner() {
  const params = useSearchParams();
  const { user } = useAuth();
  const [view, setView] = useState<ChatView | null>(null);
  const [items, setItems] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.get("tab") === "support") setView({ kind: "support" });
  }, [params]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getUserOrderChats(user.uid)
      .then(async (chats) => {
        const enriched = await Promise.all(
          chats.map(async (chat) => {
            const counterpartId = chat.buyerId === user.uid ? chat.sellerId : chat.buyerId;
            let counterpartName = "Пользователь";
            if (counterpartId === "store") {
              counterpartName = "Магазин";
            } else {
              try {
                const p = await getUserProfile(counterpartId);
                if (p) counterpartName = p.displayName;
              } catch {
                // профиль недоступен — оставляем название по умолчанию
              }
            }
            let itemImage: string | null = null;
            try {
              const order = await getOrderById(chat.orderId);
              const productId = order?.items[0]?.productId;
              if (productId) {
                const product = await getProductById(productId);
                itemImage = product?.image ?? null;
              }
            } catch {
              // товар недоступен — покажем аватар-заглушку вместо фото
            }
            const last = chat.messages[chat.messages.length - 1];
            return {
              orderId: chat.orderId,
              counterpartName,
              lastMessage: last ? last.text : "Сообщений пока нет",
              updatedAt: chat.updatedAt,
              itemImage,
            } as ChatListItem;
          })
        );
        if (!cancelled) setItems(enriched.sort((a, b) => b.updatedAt - a.updatedAt));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-bold mb-6">Чаты</h1>
      <div className="grid md:grid-cols-[320px_1fr] gap-5">
        <div className={`card p-2 md:max-h-[70vh] md:overflow-y-auto ${view ? "hidden md:block" : ""}`}>
          <button onClick={() => setView({ kind: "support" })} className={itemClasses(view?.kind === "support")}>
            <div className="w-11 h-11 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
              <LifeBuoy size={18} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="font-medium text-sm truncate">Поддержка</p>
                <ShieldCheck size={14} className="text-[#1d9bf0] shrink-0" aria-label="Официальный чат" />
              </div>
              <p className="text-xs text-white/40 truncate">Мы поможем с любым вопросом</p>
            </div>
          </button>

          <button onClick={() => setView({ kind: "news" })} className={itemClasses(view?.kind === "news")}>
            <div className="w-11 h-11 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
              <Megaphone size={18} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="font-medium text-sm truncate">Velox Trade Новости</p>
                <ShieldCheck size={14} className="text-[#1d9bf0] shrink-0" aria-label="Официальный чат" />
              </div>
              <p className="text-xs text-white/40 truncate">Официальный канал</p>
            </div>
          </button>

          <div className="border-t border-border my-2" />

          {!user ? (
            <p className="text-xs text-white/30 text-center py-6 px-2">
              Войдите в аккаунт, чтобы увидеть чаты по своим сделкам.
            </p>
          ) : loading ? (
            <p className="text-xs text-white/30 text-center py-6">Загрузка...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-6 px-2">Чатов по сделкам пока нет.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.orderId}
                onClick={() => setView({ kind: "order", orderId: item.orderId, counterpartName: item.counterpartName })}
                className={itemClasses(view?.kind === "order" && view.orderId === item.orderId)}
              >
                {item.itemImage ? (
                  <div className="relative w-11 h-11 rounded-btn overflow-hidden bg-black/30 shrink-0">
                    <Image src={safeImageSrc(item.itemImage)} alt="" fill className="object-cover" sizes="44px" />
                  </div>
                ) : (
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
                    style={{ background: `${avatarColor(item.counterpartName)}22`, color: avatarColor(item.counterpartName) }}
                  >
                    {initials(item.counterpartName) || "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm truncate">{item.counterpartName}</p>
                    <span className="text-[10px] text-white/30 shrink-0">{formatWhen(item.updatedAt)}</span>
                  </div>
                  <p className="text-xs text-white/40 truncate">{item.lastMessage}</p>
                </div>
              </button>
            ))
          )}
        </div>

        <div className={`card p-5 ${!view ? "hidden md:block" : ""}`}>
          {!view ? (
            <div className="text-center text-white/30 py-24">
              <MessageCircle className="mx-auto mb-2" size={28} />
              Выберите чат слева
            </div>
          ) : (
            <>
              <button onClick={() => setView(null)} className="md:hidden text-xs text-white/40 hover:text-white/70 mb-4 flex items-center gap-1">
                <ChevronLeft size={14} /> Ко всем чатам
              </button>
              {view.kind === "support" && <SupportPanel />}
              {view.kind === "news" && <NewsPanel />}
              {view.kind === "order" && <OrderChatThread orderId={view.orderId} counterpartName={view.counterpartName} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatsPage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto px-4 py-20 text-center text-white/40">Загрузка...</div>}>
      <ChatsInner />
    </Suspense>
  );
}
