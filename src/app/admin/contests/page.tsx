"use client";

import { useEffect, useState } from "react";
import { Gift, Users, ExternalLink, Trophy, Clock, Dices, CheckSquare, Square } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useToast } from "@/lib/toastContext";
import { TelegramContest, TelegramContestEntry } from "@/types";

type ContestWithEntries = TelegramContest & { entries: TelegramContestEntry[] };

/** "2 дня 3 часа" / "5 часов" / "12 минут" — сколько конкурс уже идёт (или шёл до завершения). */
function formatDuration(fromMs: number, toMs: number): string {
  const totalMinutes = Math.floor((toMs - fromMs) / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} дн ${hours} ч`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

export default function AdminContestsPage() {
  const [contests, setContests] = useState<ContestWithEntries[]>([]);
  const [loading, setLoading] = useState(true);
  const [finishingId, setFinishingId] = useState<string | null>(null);
  // Для конкурса, у которого сейчас открыт ручной выбор победителей — id конкурса и набор отмеченных chatId.
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [pickedChatIds, setPickedChatIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  async function load() {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return;
    const res = await fetch("/api/admin/contests", { headers: { Authorization: `Bearer ${idToken}` } });
    const data = await res.json();
    if (res.ok) setContests(data.contests);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleFinishRandom(contestId: string) {
    if (!confirm("Подвести итоги случайным выбором? Победители выберутся из всех участников, отменить нельзя.")) return;
    setFinishingId(contestId);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/contests/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ contestId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("success", "Итоги подведены и опубликованы в канале.");
      load();
    } catch (err: any) {
      toast("error", err?.message || "Не удалось завершить конкурс");
    } finally {
      setFinishingId(null);
    }
  }

  function startPicking(contest: ContestWithEntries) {
    setPickingFor(contest.id);
    setPickedChatIds(new Set());
  }

  function togglePick(chatId: number, maxWinners: number) {
    setPickedChatIds((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else if (next.size < maxWinners) {
        next.add(chatId);
      }
      return next;
    });
  }

  async function handleFinishManual(contestId: string) {
    if (pickedChatIds.size === 0) {
      toast("warning", "Отметь хотя бы одного победителя.");
      return;
    }
    if (!confirm(`Подвести итоги с выбранными победителями (${pickedChatIds.size})? Отменить нельзя.`)) return;
    setFinishingId(contestId);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/contests/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ contestId, winnerChatIds: [...pickedChatIds] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("success", "Итоги подведены и опубликованы в канале.");
      setPickingFor(null);
      load();
    } catch (err: any) {
      toast("error", err?.message || "Не удалось завершить конкурс");
    } finally {
      setFinishingId(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <Gift size={22} /> Конкурсы в Telegram-боте
      </h1>
      <p className="text-sm text-white/40 max-w-2xl mb-5">
        Создаются командой «Конкурсы» в самом боте (мастер по шагам). Здесь — список всех конкурсов, счётчик
        участников, время проведения и два способа подвести итоги: случайным выбором или вручную отметив
        победителей. Автозавершения нет — конкурс остаётся активным, пока ты сам не завершишь его.
      </p>

      {loading ? (
        <p className="text-white/40 text-sm">Загрузка...</p>
      ) : contests.length === 0 ? (
        <p className="text-white/40 text-sm">Пока нет ни одного конкурса — создай его в боте.</p>
      ) : (
        <div className="space-y-4">
          {contests.map((c) => {
            const isPicking = pickingFor === c.id;
            const durationEnd = c.status === "active" ? Date.now() : c.finishedAt ?? Date.now();
            return (
              <div key={c.id} className="card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div className="min-w-0">
                    <p className="font-medium">{c.text}</p>
                    <p className="text-xs text-white/40 mt-1 flex items-center gap-1 flex-wrap">
                      <span>Канал: {c.channelId}</span>
                      <span>· Победителей: {c.winnersCount}</span>
                      <span>· {c.status === "active" ? "🟢 Активен" : "🏁 Завершён"}</span>
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> {formatDuration(c.createdAt, durationEnd)}
                      </span>
                    </p>
                  </div>
                  {/* Заметный счётчик участников */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 text-accent font-semibold text-sm shrink-0">
                    <Users size={15} /> {c.entries.length}
                  </div>
                </div>

                {c.status === "active" && !isPicking && (
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <button
                      onClick={() => handleFinishRandom(c.id)}
                      disabled={finishingId === c.id || c.entries.length === 0}
                      className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                    >
                      <Dices size={14} /> {finishingId === c.id ? "Подводим..." : "Случайные победители"}
                    </button>
                    <button
                      onClick={() => startPicking(c)}
                      disabled={c.entries.length === 0}
                      className="btn-secondary px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                    >
                      <Trophy size={14} /> Выбрать победителей вручную
                    </button>
                  </div>
                )}

                {isPicking && (
                  <div className="mb-3 p-3 rounded-lg bg-black/20 border border-accent/20">
                    <p className="text-xs text-white/50 mb-2">
                      Отметь до {c.winnersCount} {c.winnersCount === 1 ? "победителя" : "победителей"} — выбрано {pickedChatIds.size}/{c.winnersCount}
                    </p>
                    <div className="space-y-1 max-h-56 overflow-y-auto mb-3">
                      {c.entries.map((e) => {
                        const checked = pickedChatIds.has(e.chatId);
                        return (
                          <button
                            key={e.chatId}
                            onClick={() => togglePick(e.chatId, c.winnersCount)}
                            className={`w-full flex items-center gap-2 text-xs py-1.5 px-2 rounded-md text-left ${
                              checked ? "bg-accent/15 text-accent" : "text-white/60 hover:bg-white/5"
                            }`}
                          >
                            {checked ? <CheckSquare size={14} /> : <Square size={14} />}
                            {e.firstName}
                            {e.telegramUsername && ` (@${e.telegramUsername})`}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleFinishManual(c.id)}
                        disabled={finishingId === c.id || pickedChatIds.size === 0}
                        className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Trophy size={14} /> {finishingId === c.id ? "Подводим..." : "Завершить с этими победителями"}
                      </button>
                      <button onClick={() => setPickingFor(null)} className="btn-secondary px-4 py-2 text-sm">
                        Отмена
                      </button>
                    </div>
                  </div>
                )}

                {c.status !== "active" && (
                  <p className="text-xs text-white/30 whitespace-nowrap mb-3">
                    Победители: {c.winnerChatIds?.length ?? 0}
                  </p>
                )}

                <div className="border-t border-border pt-3">
                  <p className="text-xs text-white/50 mb-2 flex items-center gap-1.5">
                    <Users size={13} /> Список участников ({c.entries.length})
                  </p>
                  {c.entries.length === 0 ? (
                    <p className="text-xs text-white/30">Пока никто не участвует.</p>
                  ) : (
                    <div className="space-y-1 max-h-56 overflow-y-auto">
                      {c.entries.map((e) => {
                        const isWinner = c.winnerChatIds?.includes(e.chatId);
                        return (
                          <div key={e.chatId} className="flex items-center justify-between text-xs py-1">
                            <span className={isWinner ? "text-accent font-medium" : "text-white/60"}>
                              {isWinner && "🏆 "}
                              {e.firstName}
                              {e.telegramUsername && ` (@${e.telegramUsername})`}
                            </span>
                            {e.telegramUsername && (
                              <a
                                href={`https://t.me/${e.telegramUsername}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-white/30 hover:text-white/60"
                                title="Открыть чат в Telegram"
                              >
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

