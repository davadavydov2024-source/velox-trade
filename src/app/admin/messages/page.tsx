"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Eye, MessageSquare, ShoppingBag, ShieldCheck, X, ArrowLeft } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useToast } from "@/lib/toastContext";
import { safeImageSrc, isValidImageSrc } from "@/lib/safeImage";

type ChatType = "dm" | "order";

interface Person {
  uid: string;
  name: string;
}

interface ChatSummary {
  id: string;
  people: Person[];
  lastMessage: string;
  updatedAt: number;
  count: number;
}

interface Msg {
  from: string;
  text?: string;
  createdAt: number;
  imageUrl?: string;
}

interface Thread {
  type: ChatType;
  id: string;
  people?: Person[];
  buyerId?: string;
  sellerId?: string;
  messages: Msg[];
}

function timeLabel(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function api<T>(path: string): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${idToken}` }, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Ошибка запроса");
  return data as T;
}

function AdminMessagesInner() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const uidFilter = searchParams.get("uid") ?? "";

  const [type, setType] = useState<ChatType>("dm");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type });
      if (uidFilter) params.set("uid", uidFilter);
      if (search.trim()) params.set("q", search.trim());
      const data = await api<{ items: ChatSummary[] }>(`/api/admin/messages?${params.toString()}`);
      setItems(data.items);
    } catch (err: any) {
      toast("error", err?.message || "Не удалось загрузить переписки");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [type, uidFilter, search, toast]);

  useEffect(() => {
    const t = setTimeout(load, search ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useEffect(() => {
    setThread(null);
  }, [type]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread]);

  async function openThread(id: string) {
    setThreadLoading(true);
    try {
      setThread(await api<Thread>(`/api/admin/messages/thread?type=${type}&id=${encodeURIComponent(id)}`));
    } catch (err: any) {
      toast("error", err?.message || "Не удалось открыть чат");
    } finally {
      setThreadLoading(false);
    }
  }

  const nameOf = (uid: string): string => {
    const fromThread = thread?.people?.find((p) => p.uid === uid)?.name;
    if (fromThread) return fromThread;
    const fromList = items.flatMap((i) => i.people).find((p) => p.uid === uid)?.name;
    return fromList ?? uid.slice(0, 8);
  };

  function senderLabel(m: Msg): string {
    if (m.from === "system") return "Система";
    if (m.from === "admin") return "Админ";
    if (thread?.type === "order") {
      if (m.from === "buyer") return `Покупатель · ${nameOf(thread.buyerId ?? "")}`;
      if (m.from === "seller") return `Продавец · ${nameOf(thread.sellerId ?? "")}`;
    }
    return nameOf(m.from);
  }

  // «Левая/правая» сторона: в ЛС — по порядку участников, в заказе — покупатель слева, продавец справа.
  function isRight(m: Msg): boolean {
    if (thread?.type === "order") return m.from === "seller" || m.from === "admin";
    return !!thread?.people?.[1] && m.from === thread.people[1].uid;
  }

  const showList = !thread;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Eye size={22} className="text-accent" /> Переписки
        </h1>
        <p className="text-sm text-white/40">Просмотр личных сообщений и чатов заказов для модерации и разбора жалоб. Только чтение.</p>
      </div>

      <div className="flex items-start gap-2 text-xs text-white/50 bg-white/5 border border-white/10 rounded-btn p-3">
        <ShieldCheck size={14} className="shrink-0 mt-0.5 text-accent" />
        <span>
          Каждое открытие чата записывается в журнал доступа (коллекция <code>adminAuditLog</code>). Используй переписки только для безопасности площадки:
          споры, мошенничество, жалобы. Пользователям об этом нужно сообщать в Политике конфиденциальности.
        </span>
      </div>

      {uidFilter && (
        <div className="flex items-center justify-between p-3 rounded-btn bg-accent/10 border border-accent/20 text-sm">
          <span className="text-white/70">
            Показаны переписки одного пользователя: <span className="font-mono text-xs">{uidFilter}</span>
          </span>
          <button onClick={() => router.push("/admin/messages")} className="text-accent hover:underline flex items-center gap-1">
            <X size={13} /> Показать все
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1.5">
          {([
            ["dm", "Личные сообщения", <MessageSquare key="a" size={14} />],
            ["order", "Чаты заказов", <ShoppingBag key="b" size={14} />],
          ] as const).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setType(id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-colors ${
                type === id ? "bg-accent text-black" : "bg-white/5 text-white/55 hover:bg-white/10"
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
          <input
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={type === "dm" ? "Поиск по нику или UID участника" : "Поиск по нику, UID или номеру заказа"}
            className="input-field pl-9 py-2.5 text-sm"
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-4">
        {/* Список */}
        <div className={`card overflow-hidden ${showList ? "" : "hidden lg:block"}`}>
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-border/50">
            {loading ? (
              [0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse bg-white/[0.02]" />)
            ) : items.length === 0 ? (
              <p className="p-8 text-center text-sm text-white/40">Переписок не найдено</p>
            ) : (
              items.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openThread(c.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-white/[0.04] transition-colors ${thread?.id === c.id ? "bg-accent/[0.07]" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm truncate">{c.people.map((p) => p.name).join(" ↔ ")}</p>
                    <span className="text-[10px] text-white/30 shrink-0">{timeLabel(c.updatedAt)}</span>
                  </div>
                  <p className="text-xs text-white/40 truncate mt-0.5">{c.lastMessage || "—"}</p>
                  <p className="text-[10px] text-white/25 mt-0.5">
                    {type === "order" ? `Заказ ${c.id.slice(0, 8)}… · ` : ""}
                    сообщений: {c.count}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Переписка */}
        <div className={`card flex flex-col min-h-[50vh] ${showList ? "hidden lg:flex" : "flex"}`}>
          {!thread && !threadLoading ? (
            <div className="flex-1 flex items-center justify-center text-sm text-white/30 p-10 text-center">Выбери переписку слева, чтобы прочитать её</div>
          ) : threadLoading ? (
            <div className="flex-1 flex items-center justify-center text-sm text-white/40">Загрузка...</div>
          ) : thread ? (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                <button onClick={() => setThread(null)} className="lg:hidden text-white/50 hover:text-white">
                  <ArrowLeft size={18} />
                </button>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {thread.type === "dm" ? thread.people?.map((p) => p.name).join(" ↔ ") : `Чат заказа ${thread.id.slice(0, 8)}…`}
                  </p>
                  <p className="text-[11px] text-white/35">Режим чтения · сообщений: {thread.messages.length}</p>
                </div>
              </div>
              <div className="flex-1 max-h-[60vh] overflow-y-auto p-4 space-y-3">
                {thread.messages.length === 0 && <p className="text-center text-sm text-white/30">Сообщений нет</p>}
                {thread.messages.map((m, i) => {
                  const right = isRight(m);
                  if (m.from === "system") {
                    return (
                      <p key={i} className="text-center text-[11px] text-white/35">
                        {m.text} · {timeLabel(m.createdAt)}
                      </p>
                    );
                  }
                  return (
                    <div key={i} className={`flex ${right ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${right ? "bg-accent/15" : "bg-white/5"}`}>
                        <p className="text-[10px] text-white/40 mb-0.5">{senderLabel(m)}</p>
                        {m.imageUrl && isValidImageSrc(m.imageUrl) && (
                          <a href={m.imageUrl} target="_blank" rel="noreferrer" className="block relative w-48 h-48 rounded-lg overflow-hidden bg-black/30 mb-1.5">
                            <Image src={safeImageSrc(m.imageUrl)} alt="" fill className="object-cover" sizes="192px" />
                          </a>
                        )}
                        {m.text && <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>}
                        <p className="text-[10px] text-white/30 mt-1 text-right">{timeLabel(m.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function AdminMessagesPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-white/40">Загрузка...</div>}>
      <AdminMessagesInner />
    </Suspense>
  );
}
