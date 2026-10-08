"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { LifeBuoy, Megaphone, ShieldCheck, ChevronLeft, MessageCircle, Search, X } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getUserOrderChats } from "@/lib/orderChats";
import { getOrderById } from "@/lib/users";
import { getPublicProfileCached } from "@/lib/sellerCache";
import { getProductById } from "@/lib/products";
import { safeImageSrc } from "@/lib/safeImage";
import { SupportPanel } from "@/components/SupportPanel";
import { NewsPanel } from "@/components/NewsPanel";
import { OrderChatThread } from "@/components/OrderChatThread";
import { DmThread } from "@/components/DmThread";
import { subscribeUserConversations, conversationId as buildConversationId } from "@/lib/directMessages";
import { useUnread } from "@/lib/unreadContext";
import { DirectConversation } from "@/types";
import { NotifyConnectBanner } from "@/components/NotifyConnectBanner";

type ChatView =
  | { kind: "support" }
  | { kind: "news" }
  | { kind: "order"; orderId: string; counterpartName: string; counterpartUsername: string | null }
  | { kind: "dm"; peerUid: string; peerName: string; peerPhoto: string | null };

interface ChatListItem {
  orderId: string;
  counterpartName: string;
  counterpartUsername: string | null;
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
  return `relative w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all duration-150 ${
    active
      ? "bg-gradient-to-r from-accent/20 to-accent/[0.04] ring-1 ring-accent/25"
      : "hover:bg-white/[0.05] active:bg-white/10"
  }`;
}

/** Счётчик непрочитанных — акцентная «пилюля»; 99+ вместо длинных чисел. */
function UnreadBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-black text-[11px] font-bold leading-5 text-center shadow-[0_0_10px_-1px_var(--color-accent)]">
      {n > 99 ? "99+" : n}
    </span>
  );
}

type ChatFilter = "all" | "deals" | "dm";
const FILTERS: { id: ChatFilter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "deals", label: "Сделки" },
  { id: "dm", label: "Личные" },
];

function ChatsInner() {
  const params = useSearchParams();
  const { user } = useAuth();
  const [view, setView] = useState<ChatView | null>(null);
  const [items, setItems] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dmConversations, setDmConversations] = useState<DirectConversation[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const unread = useUnread();

  useEffect(() => {
    if (params.get("tab") === "support") setView({ kind: "support" });
  }, [params]);

  // Пришли по ссылке "Написать" с профиля продавца (?dm=<uid>&name=<имя>&photo=<url>) — открываем
  // личную переписку с этим человеком сразу, не дожидаясь клика в списке.
  useEffect(() => {
    const dmUid = params.get("dm");
    if (!dmUid || !user) return;
    const name = params.get("name") || "Пользователь";
    const photo = params.get("photo") || null;
    setView({ kind: "dm", peerUid: dmUid, peerName: name, peerPhoto: photo });
  }, [params, user]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeUserConversations(user.uid, setDmConversations);
    return unsub;
  }, [user]);

  // Пришли сразу после покупки/выигрыша с конкретным ?order= — открываем этот чат, как только
  // список чатов подгрузится (имя собеседника берём уже из готового списка, не запрашиваем отдельно).
  useEffect(() => {
    const orderId = params.get("order");
    if (!orderId || loading) return;
    const match = items.find((i) => i.orderId === orderId);
    if (match) setView({ kind: "order", orderId, counterpartName: match.counterpartName, counterpartUsername: match.counterpartUsername });
  }, [params, items, loading]);

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
            let counterpartUsername: string | null = null;
            if (counterpartId === "store") {
              counterpartName = "Магазин";
            } else {
              try {
                // Через серверный кэш, а не прямое чтение users/{uid}: правила Firestore разрешают
                // читать чужой профиль только админу, поэтому раньше здесь у обычных пользователей
                // молча подставлялось "Пользователь" вместо настоящего ника.
                const p = await getPublicProfileCached(counterpartId);
                if (p) {
                  counterpartName = p.displayName;
                  counterpartUsername = p.username;
                }
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
              counterpartUsername,
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

  // Список сделок загружается один раз (с именами и фото), а «живые» данные — последнее сообщение и время —
  // накладываем поверх из общей подписки: новое сообщение сразу поднимает чат наверх и подсвечивает его.
  const liveItems = items
    .map((i) => {
      const live = unread.orderChats.find((c) => c.orderId === i.orderId);
      if (!live) return i;
      const last = live.messages[live.messages.length - 1];
      return {
        ...i,
        updatedAt: live.updatedAt,
        lastMessage: last ? (last.imageUrl && !last.text ? "📷 Фото" : last.text) : i.lastMessage,
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const unreadDeals = Object.values<number>(unread.byOrder).reduce((a, b) => a + b, 0);
  const unreadDms = Object.values<number>(unread.byDm).reduce((a, b) => a + b, 0);

  const q = query.trim().toLowerCase();
  const shownItems = filter === "dm" ? [] : liveItems.filter((i) => !q || i.counterpartName.toLowerCase().includes(q) || i.lastMessage.toLowerCase().includes(q));
  const shownDms =
    filter === "deals"
      ? []
      : dmConversations.filter((conv) => {
          if (!user || !q) return true;
          const peerUid = conv.participants.find((p) => p !== user.uid)!;
          return (conv.participantNames[peerUid] ?? "").toLowerCase().includes(q) || conv.lastMessage.toLowerCase().includes(q);
        });
  const showOfficial = !q || "поддержка velox trade новости".includes(q);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-6 hidden sm:flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Чаты</h1>
          <p className="text-sm text-white/40 mt-1">Сделки, личные сообщения и поддержка — в одном месте</p>
        </div>
      </div>
      <NotifyConnectBanner context="новые сообщения в чатах" storageKey="notifyBannerDismissed_chats" />
      <div className="grid md:grid-cols-[340px_1fr] gap-5">
        {/* Левая колонка: фиксированная шапка (поиск + вкладки) и ОТДЕЛЬНО прокручиваемый список.
            Раньше шапка была sticky с отрицательными отступами внутри скруглённой карточки — углы
            торчали наружу, а блок «плыл» при прокрутке. */}
        <div className={`card overflow-hidden md:flex md:flex-col md:h-[75vh] ${view ? "hidden" : ""}`}>
          <div className="shrink-0 p-3 space-y-2.5 border-b border-white/[0.06]">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              <input
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по чатам"
                className="input-field h-10 !py-0 pl-10 pr-9 text-sm rounded-full"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10"
                  aria-label="Очистить поиск"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-full bg-black/30">
              {FILTERS.map((f) => {
                const count = f.id === "deals" ? items.length : f.id === "dm" ? dmConversations.length : 0;
                const unreadCount = f.id === "deals" ? unreadDeals : f.id === "dm" ? unreadDms : unread.total;
                const active = filter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`h-8 rounded-full text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                      active ? "bg-accent text-black shadow-[0_2px_10px_-2px_var(--color-accent)]" : "text-white/55 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {f.label}
                    {unreadCount > 0 ? (
                      <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] leading-[18px] text-center font-bold ${active ? "bg-black text-accent" : "bg-accent text-black"}`}>
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : count > 0 && (
                      <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] leading-[18px] text-center font-semibold ${active ? "bg-black/20 text-black" : "bg-white/10 text-white/60"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-2 md:flex-1 md:min-h-0 md:overflow-y-auto">
          {showOfficial && filter !== "deals" && filter !== "dm" && (
            <>
          <button onClick={() => setView({ kind: "support" })} className={itemClasses(view?.kind === "support")}>
            {view?.kind === "support" && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-accent" />}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent/30 to-accent/10 flex items-center justify-center shrink-0">
              <LifeBuoy size={19} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className={`text-sm truncate ${unread.support > 0 ? "font-bold" : "font-medium"}`}>Поддержка</p>
                <ShieldCheck size={14} className="text-[#1d9bf0] shrink-0" aria-label="Официальный чат" />
              </div>
              <p className={`text-xs truncate ${unread.support > 0 ? "text-white/80" : "text-white/40"}`}>
                {unread.support > 0 ? "Новый ответ от поддержки" : "Мы поможем с любым вопросом"}
              </p>
            </div>
            <UnreadBadge n={unread.support} />
          </button>

          <button onClick={() => setView({ kind: "news" })} className={itemClasses(view?.kind === "news")}>
            {view?.kind === "news" && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-accent" />}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1d9bf0]/30 to-[#1d9bf0]/10 flex items-center justify-center shrink-0">
              <Megaphone size={19} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="font-medium text-sm truncate">Velox Trade Новости</p>
                <ShieldCheck size={14} className="text-[#1d9bf0] shrink-0" aria-label="Официальный чат" />
              </div>
              <p className="text-xs text-white/40 truncate">Официальный канал</p>
            </div>
          </button>
            </>
          )}

          {showOfficial && filter === "all" && <div className="border-t border-border my-2" />}

          {!user ? (
            <p className="text-xs text-white/30 text-center py-6 px-2">
              Войдите в аккаунт, чтобы увидеть чаты по своим сделкам.
            </p>
          ) : loading ? (
            <div className="space-y-2 px-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                  <div className="w-12 h-12 rounded-full bg-white/5 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 bg-white/5 rounded w-2/3" />
                    <div className="h-2 bg-white/5 rounded w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : filter === "dm" ? null : shownItems.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-6 px-2">{q ? "Ничего не найдено." : "Чатов по сделкам пока нет."}</p>
          ) : (
            shownItems.map((item) => {
              const active = view?.kind === "order" && view.orderId === item.orderId;
              return (
                <button
                  key={item.orderId}
                  onClick={() => setView({ kind: "order", orderId: item.orderId, counterpartName: item.counterpartName, counterpartUsername: item.counterpartUsername })}
                  className={itemClasses(active)}
                >
                  {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-accent" />}
                  {item.itemImage ? (
                    <div className="relative w-12 h-12 rounded-btn overflow-hidden bg-black/30 shrink-0">
                      <Image src={safeImageSrc(item.itemImage)} alt="" fill className="object-cover" sizes="48px" />
                    </div>
                  ) : (
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-sm font-bold"
                      style={{ background: `${avatarColor(item.counterpartName)}22`, color: avatarColor(item.counterpartName) }}
                    >
                      {initials(item.counterpartName) || "?"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {(() => {
                      const n = unread.byOrder[item.orderId] ?? 0;
                      return (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-sm truncate ${n > 0 ? "font-bold" : "font-medium"}`}>{item.counterpartName}</p>
                            <span className={`text-[10px] shrink-0 ${n > 0 ? "text-accent" : "text-white/30"}`}>{formatWhen(item.updatedAt)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs truncate ${n > 0 ? "text-white/85" : "text-white/40"}`}>{item.lastMessage}</p>
                            <UnreadBadge n={n} />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </button>
              );
            })
          )}

          {user && filter === "dm" && shownDms.length === 0 && (
            <p className="text-xs text-white/30 text-center py-6 px-2">{q ? "Ничего не найдено." : "Личных сообщений пока нет."}</p>
          )}

          {user && shownDms.length > 0 && (
            <>
              {filter === "all" && <div className="border-t border-border my-2" />}
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/25">Личные сообщения</p>
              {shownDms.map((conv) => {
                const peerUid = conv.participants.find((p) => p !== user.uid)!;
                const peerName = conv.participantNames[peerUid] ?? "Пользователь";
                const peerPhoto = conv.participantPhotos[peerUid] ?? null;
                const active = view?.kind === "dm" && view.peerUid === peerUid;
                return (
                  <button key={conv.id} onClick={() => setView({ kind: "dm", peerUid, peerName, peerPhoto })} className={itemClasses(active)}>
                    {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-accent" />}
                    <div
                      className="relative w-12 h-12 rounded-full overflow-hidden bg-black/30 shrink-0 flex items-center justify-center text-xs font-semibold"
                      style={!peerPhoto ? { background: `${avatarColor(peerName)}22`, color: avatarColor(peerName) } : undefined}
                    >
                      {peerPhoto ? <Image src={safeImageSrc(peerPhoto)} alt="" fill className="object-cover" sizes="48px" /> : initials(peerName) || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      {(() => {
                        const n = unread.byDm[peerUid] ?? 0;
                        return (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-sm truncate ${n > 0 ? "font-bold" : "font-medium"}`}>{peerName}</p>
                              <span className={`text-[10px] shrink-0 ${n > 0 ? "text-accent" : "text-white/30"}`}>{formatWhen(conv.updatedAt)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-xs truncate ${n > 0 ? "text-white/85" : "text-white/40"}`}>{conv.lastMessage}</p>
                              <UnreadBadge n={n} />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </button>
                );
              })}
            </>
          )}
          </div>
        </div>

        {/* На мобильных открытый чат — отдельный полноэкранный слой (как в мессенджерах), а не
           card с ограниченной высотой; на десктопе — обычная правая колонка макета.
           z-[60] — специально ВЫШЕ, чем z-40 у MobileTabBar (см. components/MobileTabBar.tsx):
           раньше был тот же z-40, и при равном z-index шторка (рендерится позже в layout.tsx)
           перекрывала низ экрана чата, включая поле ввода — из-за этого не получалось писать
           в чатах на телефонах. Теперь чат полностью накрывает шторку, пока открыт. */}
        <div
          className={`card md:p-5 flex flex-col ${
            !view ? "hidden md:flex md:h-[75vh]" : "fixed inset-0 z-[60] md:static md:z-auto rounded-none md:rounded-card md:h-[75vh]"
          }`}
        >
          {!view ? (
            <div className="text-center py-24 m-auto px-6">
              <div className="relative w-20 h-20 mx-auto mb-5">
                <div className="absolute inset-0 rounded-full blur-2xl opacity-50 bg-accent animate-pulse" />
                <div className="relative w-20 h-20 rounded-3xl flex items-center justify-center border border-accent/30 bg-gradient-to-br from-accent/25 to-accent/5 rotate-3">
                  <MessageCircle className="text-accent -rotate-3" size={32} />
                </div>
              </div>
              <p className="text-sm font-medium text-white/70 mb-1">Выберите чат слева</p>
              <p className="text-xs text-white/30 max-w-[220px] mx-auto">
                Переписки по сделкам, личные сообщения и поддержка — всё в одном месте.
              </p>
            </div>
          ) : (
            <>
              <button
                onClick={() => setView(null)}
                className="md:hidden flex items-center gap-2 text-sm text-white/60 hover:text-white px-4 py-3.5 border-b border-border shrink-0 sticky top-0 bg-bg z-10"
                style={{ paddingTop: "calc(0.875rem + env(safe-area-inset-top))" }}
              >
                <ChevronLeft size={18} /> Ко всем чатам
              </button>
              <div className="flex-1 min-h-0 flex flex-col p-4 md:p-0 overflow-hidden">
                {view.kind === "support" && <SupportPanel />}
                {view.kind === "news" && <NewsPanel />}
                {view.kind === "order" && <OrderChatThread orderId={view.orderId} counterpartName={view.counterpartName} counterpartUsername={view.counterpartUsername} />}
                {view.kind === "dm" && user && (
                  <DmThread
                    conversationId={buildConversationId(user.uid, view.peerUid)}
                    peerUid={view.peerUid}
                    peerName={view.peerName}
                    peerPhoto={view.peerPhoto}
                  />
                )}
              </div>
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
