"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Check, X, Ban, ShieldAlert, Inbox, Handshake, Send, History, ChevronRight, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { getIncomingTrades, getOutgoingTrades, respondToTrade, TRADE_DISCLAIMER } from "@/lib/trades";
import { TradeOffer, TradeOfferStatus } from "@/types";
import { NotifyConnectBanner } from "@/components/NotifyConnectBanner";
import { TradeSwap } from "@/components/TradeSwap";

const STATUS: Record<TradeOfferStatus, { text: string; color: string }> = {
  pending: { text: "Ожидает ответа", color: "#ff9800" },
  accepted: { text: "Принято", color: "#4caf50" },
  rejected: { text: "Отклонено", color: "#f44336" },
  cancelled: { text: "Отменено", color: "#9aa3b2" },
};

type Tab = "incoming" | "active" | "outgoing" | "history";

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} дн назад`;
  return new Date(ts).toLocaleDateString("ru-RU");
}

function StatusPill({ status }: { status: TradeOfferStatus }) {
  const s = STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: `${s.color}1f`, color: s.color }}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${status === "pending" ? "animate-pulse" : ""}`} style={{ background: s.color }} />
      {s.text}
    </span>
  );
}

function TradeShell({ accent, children }: { accent?: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-card border border-white/10 bg-surface/80 overflow-hidden hover:border-white/20 transition-colors">
      {accent && <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accent }} />}
      <div className="p-4 sm:p-5 space-y-4">{children}</div>
    </div>
  );
}

function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-card border border-dashed border-white/10 p-10 text-center">
      <div className="w-12 h-12 rounded-full bg-white/5 text-white/30 flex items-center justify-center mx-auto mb-3">{icon}</div>
      <p className="font-medium text-sm mb-1">{title}</p>
      <p className="text-xs text-white/35 max-w-xs mx-auto">{text}</p>
    </div>
  );
}

export default function TradesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [incoming, setIncoming] = useState<TradeOffer[]>([]);
  const [outgoing, setOutgoing] = useState<TradeOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);

  useEffect(() => {
    if (!user) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function refresh() {
    if (!user) return;
    setLoading(true);
    const [inc, out] = await Promise.all([getIncomingTrades(user.uid), getOutgoingTrades(user.uid)]);
    setIncoming(inc);
    setOutgoing(out);
    setLoading(false);
  }

  async function handleRespond(tradeId: string, action: "accept" | "reject" | "cancel") {
    setBusyId(tradeId);
    try {
      await respondToTrade(tradeId, action);
      toast("success", action === "accept" ? "Обмен принят!" : action === "reject" ? "Обмен отклонён" : "Заявка отменена");
      await refresh();
    } catch (err: any) {
      toast("error", err?.message || "Не удалось выполнить действие");
    } finally {
      setBusyId(null);
    }
  }

  const groups = useMemo(() => {
    const all = [...incoming, ...outgoing].sort((a, b) => b.createdAt - a.createdAt);
    return {
      incoming: incoming.filter((t) => t.status === "pending").sort((a, b) => b.createdAt - a.createdAt),
      active: all.filter((t) => t.status === "accepted"),
      outgoing: outgoing.filter((t) => t.status === "pending").sort((a, b) => b.createdAt - a.createdAt),
      history: all.filter((t) => t.status === "rejected" || t.status === "cancelled"),
    };
  }, [incoming, outgoing]);

  // Первая открытая вкладка — самая «горячая»: сначала то, что ждёт ответа от тебя.
  useEffect(() => {
    if (loading || tab !== null) return;
    setTab(groups.incoming.length ? "incoming" : groups.active.length ? "active" : groups.outgoing.length ? "outgoing" : "incoming");
  }, [loading, tab, groups]);

  const currentTab: Tab = tab ?? "incoming";
  const TABS: { id: Tab; label: string; icon: React.ReactNode; count: number; hot?: boolean }[] = [
    { id: "incoming", label: "Входящие", icon: <Inbox size={14} />, count: groups.incoming.length, hot: true },
    { id: "active", label: "Активные", icon: <Handshake size={14} />, count: groups.active.length },
    { id: "outgoing", label: "Исходящие", icon: <Send size={14} />, count: groups.outgoing.length },
    { id: "history", label: "История", icon: <History size={14} />, count: groups.history.length },
  ];

  const stats = [
    { label: "Ждут ответа", value: groups.incoming.length, color: "#ff9800" },
    { label: "В процессе", value: groups.active.length, color: "#4caf50" },
    { label: "Исходящих", value: groups.outgoing.length, color: "#4a6cf7" },
  ];

  return (
    <div className="space-y-5">
      {/* Шапка-герой: заголовок, описание и счётчики */}
      <div className="relative overflow-hidden rounded-card border border-white/10 p-5 sm:p-6">
        <div
          className="absolute inset-0 opacity-30"
          style={{ background: "linear-gradient(120deg, var(--color-accent) 0%, #4a6cf7 60%, transparent 100%)" }}
        />
        <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-accent/30 blur-3xl" />
        <div className="relative space-y-4">
          <div className="flex items-start gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-black shrink-0 shadow-glow"
              style={{ background: "linear-gradient(135deg, var(--color-accent), #4a6cf7)" }}
            >
              <ArrowLeftRight size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Обмены</h1>
              <p className="text-sm text-white/55">Меняйся товарами с другими игроками напрямую — без денег или с доплатой сверху.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl bg-black/30 backdrop-blur border border-white/10 px-3 py-2.5">
                <p className="text-2xl font-bold leading-none" style={{ color: s.value ? s.color : undefined }}>
                  {loading ? "–" : s.value}
                </p>
                <p className="text-[10px] sm:text-xs text-white/45 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <NotifyConnectBanner context="новые предложения обмена" storageKey="notifyBannerDismissed_trades" />

      <div className="flex items-start gap-2 text-xs text-yellow-400/80 bg-yellow-500/5 border border-yellow-500/20 rounded-btn p-3">
        <ShieldAlert size={14} className="shrink-0 mt-0.5" />
        {TRADE_DISCLAIMER}
      </div>

      {/* Вкладки со счётчиками */}
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1 pb-1">
        {TABS.map((t) => {
          const active = currentTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-all ${
                active ? "bg-accent text-black shadow-glow" : "bg-white/5 text-white/55 hover:bg-white/10"
              }`}
            >
              {t.icon}
              {t.label}
              {t.count > 0 && (
                <span
                  className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    active ? "bg-black/20 text-black" : t.hot ? "bg-accent text-black" : "bg-white/10 text-white/70"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-card border border-white/10 bg-surface/60 h-48 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {currentTab === "incoming" &&
            (groups.incoming.length === 0 ? (
              <Empty icon={<Inbox size={22} />} title="Входящих предложений нет" text="Когда кто-то предложит обмен на твой товар, оно появится здесь." />
            ) : (
              groups.incoming.map((t) => (
                <TradeShell key={t.id} accent="#ff9800">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-white/50">
                      <span className="text-white/80 font-medium">{t.fromUserNick}</span> предлагает обмен · {timeAgo(t.createdAt)}
                    </p>
                    <StatusPill status={t.status} />
                  </div>
                  <TradeSwap
                    giveName={t.offeredProductName}
                    giveImage={t.offeredProductImage}
                    giveLabel="Ты получишь"
                    getName={t.requestedProductName}
                    getImage={t.requestedProductImage}
                    getLabel="Ты отдашь"
                    extra={t.extraBalanceFromProposer}
                  />
                  {!!t.extraBalanceFromProposer && (
                    <p className="text-xs text-accent text-center flex items-center justify-center gap-1">
                      <Sparkles size={12} /> {t.fromUserNick} добавляет {t.extraBalanceFromProposer} ₽ в твою пользу
                    </p>
                  )}
                  {t.message && <p className="text-xs text-white/55 italic bg-white/5 rounded-xl px-3 py-2">«{t.message}»</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleRespond(t.id, "accept")}
                      disabled={busyId === t.id}
                      className="btn-primary py-2.5 text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Check size={15} /> Принять
                    </button>
                    <button
                      onClick={() => handleRespond(t.id, "reject")}
                      disabled={busyId === t.id}
                      className="btn-secondary py-2.5 text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <X size={15} /> Отклонить
                    </button>
                  </div>
                </TradeShell>
              ))
            ))}

          {currentTab === "active" &&
            (groups.active.length === 0 ? (
              <Empty icon={<Handshake size={22} />} title="Активных обменов нет" text="Принятые обмены с чатом и выдачей будут здесь." />
            ) : (
              groups.active.map((t) => {
                const mine = user?.uid === t.fromUserId;
                return (
                  <Link key={t.id} href={`/profile/trades/${t.id}`} className="block group">
                    <TradeShell accent="#4caf50">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-white/50">
                          С <span className="text-white/80 font-medium">{mine ? t.toUserNick : t.fromUserNick}</span> · {timeAgo(t.createdAt)}
                        </p>
                        <StatusPill status={t.status} />
                      </div>
                      <TradeSwap
                        giveName={mine ? t.offeredProductName : t.requestedProductName}
                        giveImage={mine ? t.offeredProductImage : t.requestedProductImage}
                        giveLabel="Ты отдаёшь"
                        getName={mine ? t.requestedProductName : t.offeredProductName}
                        getImage={mine ? t.requestedProductImage : t.offeredProductImage}
                        getLabel="Ты получаешь"
                        extra={t.extraBalanceFromProposer}
                        size="sm"
                      />
                      <div className="flex items-center justify-center gap-1 text-xs font-medium text-accent group-hover:gap-2 transition-all">
                        Открыть чат обмена <ChevronRight size={14} />
                      </div>
                    </TradeShell>
                  </Link>
                );
              })
            ))}

          {currentTab === "outgoing" &&
            (groups.outgoing.length === 0 ? (
              <Empty icon={<Send size={22} />} title="Ты ещё ничего не предлагал" text="Открой любой товар и нажми «Предложить обмен», чтобы отправить заявку." />
            ) : (
              groups.outgoing.map((t) => (
                <TradeShell key={t.id} accent="#4a6cf7">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-white/50">
                      Кому: <span className="text-white/80 font-medium">{t.toUserNick}</span> · {timeAgo(t.createdAt)}
                    </p>
                    <StatusPill status={t.status} />
                  </div>
                  <TradeSwap
                    giveName={t.offeredProductName}
                    giveImage={t.offeredProductImage}
                    giveLabel="Ты отдаёшь"
                    getName={t.requestedProductName}
                    getImage={t.requestedProductImage}
                    getLabel="Ты получаешь"
                    extra={t.extraBalanceFromProposer}
                    size="sm"
                  />
                  <button
                    onClick={() => handleRespond(t.id, "cancel")}
                    disabled={busyId === t.id}
                    className="btn-secondary w-full py-2 text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Ban size={13} /> Отменить заявку
                  </button>
                </TradeShell>
              ))
            ))}

          {currentTab === "history" &&
            (groups.history.length === 0 ? (
              <Empty icon={<History size={22} />} title="История пуста" text="Здесь окажутся отклонённые и отменённые обмены." />
            ) : (
              groups.history.map((t) => {
                const mine = user?.uid === t.fromUserId;
                return (
                  <div key={t.id} className="opacity-70">
                    <TradeShell>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-white/50">
                          {mine ? `Кому: ${t.toUserNick}` : `От: ${t.fromUserNick}`} · {timeAgo(t.createdAt)}
                        </p>
                        <StatusPill status={t.status} />
                      </div>
                      <TradeSwap
                        giveName={t.offeredProductName}
                        giveImage={t.offeredProductImage}
                        giveLabel={mine ? "Ты отдавал" : "Предлагали"}
                        getName={t.requestedProductName}
                        getImage={t.requestedProductImage}
                        getLabel={mine ? "Ты хотел" : "Просили"}
                        extra={t.extraBalanceFromProposer}
                        size="sm"
                      />
                    </TradeShell>
                  </div>
                );
              })
            ))}
        </div>
      )}
    </div>
  );
}
