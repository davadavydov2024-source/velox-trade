"use client";

import { useEffect, useState } from "react";
import { Gift, Users, ExternalLink, Trophy } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useToast } from "@/lib/toastContext";
import { TelegramContest, TelegramContestEntry } from "@/types";

type ContestWithEntries = TelegramContest & { entries: TelegramContestEntry[] };

export default function AdminContestsPage() {
  const [contests, setContests] = useState<ContestWithEntries[]>([]);
  const [loading, setLoading] = useState(true);
  const [finishingId, setFinishingId] = useState<string | null>(null);
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

  async function handleFinish(contestId: string) {
    if (!confirm("Подвести итоги? Победители выберутся случайно из всех участников, отменить нельзя.")) return;
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
        <Gift size={22} /> Конкурсы в Telegram-боте
      </h1>
      <p className="text-sm text-white/40 max-w-2xl mb-5">
        Создаются командой «Конкурсы» в самом боте (мастер по шагам). Здесь — список всех конкурсов, счётчик
        участников каждого и кнопка ручного подведения итогов. Автозавершения нет — конкурс остаётся активным, пока
        ты сам не нажмёшь «Подвести итоги».
      </p>

      {loading ? (
        <p className="text-white/40 text-sm">Загрузка...</p>
      ) : contests.length === 0 ? (
        <p className="text-white/40 text-sm">Пока нет ни одного конкурса — создай его в боте.</p>
      ) : (
        <div className="space-y-4">
          {contests.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                <div className="min-w-0">
                  <p className="font-medium">{c.text}</p>
                  <p className="text-xs text-white/40 mt-1">
                    Канал: {c.channelId} · Победителей: {c.winnersCount} ·{" "}
                    {c.status === "active" ? "🟢 Активен" : "🏁 Завершён"}
                  </p>
                </div>
                {/* Заметный счётчик участников — главный запрошенный элемент этой страницы */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 text-accent font-semibold text-sm shrink-0">
                  <Users size={15} /> {c.entries.length}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                {c.status === "active" ? (
                  <button
                    onClick={() => handleFinish(c.id)}
                    disabled={finishingId === c.id}
                    className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                  >
                    <Trophy size={14} /> {finishingId === c.id ? "Подводим..." : "Подвести итоги"}
                  </button>
                ) : (
                  <span className="text-xs text-white/30 whitespace-nowrap">
                    Победители: {c.winnerChatIds?.length ?? 0}
                  </span>
                )}
              </div>

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
          ))}
        </div>
      )}
    </div>
  );
}
