"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { LifeBuoy, Megaphone, ShieldCheck, ChevronLeft, MessageCircle, Search } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getUserOrderChats } from "@/lib/orderChats";
import { getUserProfile, getOrderById, isAdminUid } from "@/lib/users";
import { getProductById } from "@/lib/products";
import { safeImageSrc } from "@/lib/safeImage";
import { SupportPanel } from "@/components/SupportPanel";
import { NewsPanel } from "@/components/NewsPanel";
import { OrderChatThread } from "@/components/OrderChatThread";
import { DmThread } from "@/components/DmThread";
import { subscribeUserConversations, conversationId as buildConversationId } from "@/lib/directMessages";
import { DirectConversation, Order } from "@/types";
import { NotifyConnectBanner } from "@/components/NotifyConnectBanner";

type ChatView =
  | { kind: "support" }
  | { kind: "news" }
  | { kind: "order"; orderId: string; counterpartName: string }
  | { kind: "dm"; peerUid: string; peerName: string; peerPhoto: string | null };

type ListTab = "all" | "deals" | "personal";

interface ChatListItem {
  orderId: string;
  counterpartName: string;
  lastMessage: string;
  updatedAt: number;
  itemImage: string | null;
  orderStatus: Order["status"] | null;
}

const AVATAR_COLORS = ["#ff9800", "#4a6cf7", "#22c55e", "#e879f9", "#38bdf8", "#f87171"];

// Цвет точки-статуса поверх аватара сделки — тот же язык цвета, что и в OrderChatThread
// (STATUS_LABEL), чтобы по одному взгляду на список было видно, где что горит.
const STATUS_DOT: Record<Order["status"], string> = {
  pending_confirmation: "#ff9800",
  confirmed: "#4caf50",
  disputed: "#f44336",
  cancelled: "#6b7280",
};

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
  return `relative w-full flex items-center gap-3 p-2.5 rounded-btn text-left transition-colors ${
    active ? "bg-gradient-to-r from-accent/10 to-transparent" : "hover:bg-white/[0.04] active:bg-white/[0.06]"
  }`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2.5 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-white/25">{children}</p>;
}

function ChatsInner() {
  const params = useSearchParams();
  const { user } = useAuth();
  const [view, setView] = useState<ChatView | null>(null);
  const [items, setItems] = useState<ChatListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dmConversations, setDmConversations] = useState<DirectConversation[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<ListTab>("all");

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
    if (match) setView({ kind: "order", orderId, counterpartName: match.counterpartName });
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
            let orderStatus: Order["status"] | null = null;
            try {
              const order = await getOrderById(chat.orderId);
              orderStatus = order?.status ?? null;
              const productId = order?.items[0]?.productId;
              if (productId) {
                const product = await getProductById(productId);
                itemImage = product?.image ?? null;
              }
            } catch {
              // товар/заказ недоступен — покажем аватар-заглушку вместо фото, без статус-точки
            }
            const last = chat.messages[chat.messages.length - 1];
            return {
              orderId: chat.orderId,
              counterpartName,
              lastMessage: last ? last.text : "Сообщений пока нет",
              updatedAt: chat.updatedAt,
              itemImage,
              orderStatus,
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

  const q = search.trim().toLowerCase();
  const filteredItems = q ? items.filter((i) => (i.counterpartName + " " + i.lastMessage).toLowerCase().includes(q)) : items;
  const filteredDm = q
    ? dmConversations.filter((c) => {
        const peerUid = c.participants.find((p) => p !== user?.uid) ?? "";
        const peerName = c.participantNames[peerUid] ?? "";
        return (peerName + " " + c.lastMessage).toLowerCase().includes(q);
      })
    : dmConversations;

  const showPinned = tab === "all" && !q;
  const showDeals = tab === "all" || tab === "deals";
  const showPersonal = tab === "all" || tab === "personal";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <h1 className="text-2xl font-bold mb-6 hidden sm:block">Чаты</h1>
      <NotifyConnectBanner context="новые сообщения в чатах" storageKey="notifyBannerDismissed_chats" />
      <div className="grid md:grid-cols-[340px_1fr] gap-5">
        <div className={`card p-2 md:max-h-[75vh] md:overflow-y-auto ${view ? "hidden md:block" : ""}`}>
          {/* Поиск — фильтрует и сделки, и личные сообщения ниже по имени/тексту последнего
              сообщения. Закреплённые Поддержка/Новости при поиске уходят из виду, чтобы не мешать. */}
          <label className="flex items-center gap-2 bg-black/20 border border-border rounded-full px-3.5 py-2 mx-1 mt-1 mb-2">
            <Search size={14} className="text-white/30 shrink-0" />
            <input
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по чатам"
              className="bg-transparent outline-none text-sm placeholder:text-white/30 flex-1 min-w-0"
            />
          </label>

          {/* Табы просто скрывают/показывают группы ниже — своего отдельного состояния данных
              не заводим, вся логика загрузки чатов остаётся как была. */}
          <div className="flex items-center gap-1 px-1 mb-2 border-b border-border">
            {(
              [
                ["all", "Все"],
                ["deals", `Сделки${items.length ? ` (${items.length})` : ""}`],
                ["personal", "Личные"],
              ] as [ListTab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`relative px-3 py-2 text-sm font-medium transition-colors ${tab === key ? "text-white" : "text-white/40 hover:text-white/70"}`}
              >
                {label}
                {tab === key && <span className="absolute left-2.5 right-2.5 -bottom-px h-0.5 rounded-full bg-accent" />}
              </button>
            ))}
          </div>

          {showPinned && (
            <>
              <button onClick={() => setView({ kind: "support" })} className={itemClasses(view?.kind === "support")}>
                {view?.kind === "support" && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" />}
                <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                  <LifeBuoy size={19} className="text-accent" />
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
                {view?.kind === "news" && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" />}
                <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
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

              <div className="border-t border-border my-2" />
            </>
          )}

          {showDeals && (
            <>
              {tab === "all" && (items.length > 0 || loading) && <SectionLabel>Сделки</SectionLabel>}
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
              ) : items.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-6 px-2">Чатов по сделкам пока нет.</p>
              ) : filteredItems.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-6 px-2">Ничего не найдено.</p>
              ) : (
                filteredItems.map((item) => {
                  const active = view?.kind === "order" && view.orderId === item.orderId;
                  return (
                    <button
                      key={item.orderId}
                      onClick={() => setView({ kind: "order", orderId: item.orderId, counterpartName: item.counterpartName })}
                      className={itemClasses(active)}
                    >
                      {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" />}
                      <div className="relative shrink-0">
                        {item.itemImage ? (
                          <div className="relative w-12 h-12 rounded-btn overflow-hidden bg-black/30">
                            <Image src={safeImageSrc(item.itemImage)} alt="" fill className="object-cover" sizes="48px" />
                          </div>
                        ) : (
                          <div
                            className="w-12 h-12 rounded-full flex items-center justify-center text-xs font-semibold"
                            style={{ background: `${avatarColor(item.counterpartName)}22`, color: avatarColor(item.counterpartName) }}
                          >
                            {initials(item.counterpartName) || "?"}
                          </div>
                        )}
                        {item.orderStatus && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-surface"
                            style={{ background: STATUS_DOT[item.orderStatus] }}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm truncate">{item.counterpartName}</p>
                          <span className="text-[10px] text-white/30 shrink-0">{formatWhen(item.updatedAt)}</span>
                        </div>
                        <p className={`text-xs truncate ${item.orderStatus === "disputed" ? "text-red-400/80" : "text-white/40"}`}>
                          {item.lastMessage}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </>
          )}

          {showPersonal && user && dmConversations.length > 0 && (
            <>
              {tab === "all" && <div className="border-t border-border my-2" />}
              <SectionLabel>Личные</SectionLabel>
              {tab === "personal" && (
                <p className="px-2.5 pb-2 text-[11px] text-white/25">
                  Сюда попадают только сообщения от администрации — пользователи не могут писать друг другу напрямую, только в чатах по сделкам.
                </p>
              )}
              {filteredDm.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-6 px-2">Ничего не найдено.</p>
              ) : (
                filteredDm.map((conv) => {
                  const peerUid = conv.participants.find((p) => p !== user.uid)!;
                  const peerName = conv.participantNames[peerUid] ?? "Пользователь";
                  const peerPhoto = conv.participantPhotos[peerUid] ?? null;
                  const active = view?.kind === "dm" && view.peerUid === peerUid;
                  return (
                    <button key={conv.id} onClick={() => setView({ kind: "dm", peerUid, peerName, peerPhoto })} className={itemClasses(active)}>
                      {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" />}
                      <div
                        className="relative w-12 h-12 rounded-full overflow-hidden bg-black/30 shrink-0 flex items-center justify-center text-xs font-semibold"
                        style={!peerPhoto ? { background: `${avatarColor(peerName)}22`, color: avatarColor(peerName) } : undefined}
                      >
                        {peerPhoto ? <Image src={safeImageSrc(peerPhoto)} alt="" fill className="object-cover" sizes="48px" /> : initials(peerName) || "?"}
                        {isAdminUid(peerUid) && (
                          <span className="absolute -bottom-1 -right-1 text-[8px] font-bold px-1 py-0.5 rounded-full text-black bg-accent">
                            ADM
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-sm truncate">{peerName}</p>
                          <span className="text-[10px] text-white/30 shrink-0">{formatWhen(conv.updatedAt)}</span>
                        </div>
                        <p className="text-xs text-white/40 truncate">{conv.lastMessage}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </>
          )}

          {showPersonal && tab === "personal" && user && dmConversations.length === 0 && (
            <p className="text-xs text-white/30 text-center py-6 px-2">
              Личных сообщений пока нет — сюда попадают только сообщения от администрации.
            </p>
          )}
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
            <div className="text-center text-white/30 py-24 m-auto">
              <MessageCircle className="mx-auto mb-2" size={28} />
              Выберите чат слева
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
                {view.kind === "order" && <OrderChatThread orderId={view.orderId} counterpartName={view.counterpartName} />}
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
