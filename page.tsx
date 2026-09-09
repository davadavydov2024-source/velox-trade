"use client";

import { useEffect, useState } from "react";
import { Gift, Users, ExternalLink, Trophy, Clock, Dices, CheckSquare, Square, Plus, X } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useToast } from "@/lib/toastContext";
import { TelegramContest, TelegramContestEntry } from "@/types";
import { ImageUploadField } from "@/components/ImageUploadField";

type ContestWithEntries = TelegramContest & { entries: TelegramContestEntry[] };

const COLOR_CHOICES: { label: string; value: string }[] = [
  { label: "🔵 Синий", value: "blue" },
  { label: "🟢 Зелёный", value: "green" },
  { label: "🔴 Красный", value: "red" },
  { label: "🟡 Жёлтый", value: "yellow" },
  { label: "⚪️ Обычный", value: "default" },
];

const EMPTY_FORM = {
  winnersCount: "1",
  text: "",
  buttonText: "Участвовать 🎉",
  buttonColor: "default",
  channelId: "",
  photoUrl: "",
};

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

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  function updateForm<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate() {
    const winnersCount = Number(form.winnersCount);
    if (!Number.isInteger(winnersCount) || winnersCount < 1 || winnersCount > 50) {
      toast("warning", "Число победителей должно быть целым от 1 до 50.");
      return;
    }
    if (!form.text.trim()) {
      toast("warning", "Заполни текст конкурса.");
      return;
    }
    if (!form.buttonText.trim()) {
      toast("warning", "Заполни текст кнопки.");
      return;
    }
    if (!form.channelId.trim()) {
      toast("warning", "Укажи канал (например, @my_channel).");
      return;
    }

    setCreating(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/contests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          winnersCount,
          text: form.text.trim(),
          buttonText: form.buttonText.trim(),
          buttonColor: form.buttonColor,
          channelId: form.channelId.trim(),
          photoUrl: form.photoUrl || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("success", "Конкурс создан и опубликован в канале.");
      setForm(EMPTY_FORM);
      setShowCreate(false);
      load();
    } catch (err: any) {
      toast("error", err?.message || "Не удалось создать конкурс");
    } finally {
      setCreating(false);
    }
  }

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
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift size={22} /> Конкурсы в Telegram-боте
        </h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5 whitespace-nowrap"
        >
          {showCreate ? <X size={14} /> : <Plus size={14} />} {showCreate ? "Отмена" : "Новый конкурс"}
        </button>
      </div>
      <p className="text-sm text-white/40 max-w-2xl mb-5">
        Создать конкурс можно здесь же на сайте (кнопка выше) или командой «Конкурсы» в самом боте — оба
        способа делают одно и то же и публикуют пост в канале. Ниже — список всех конкурсов, счётчик
        участников, время проведения и два способа подвести итоги: случайным выбором или вручную отметив
        победителей. Автозавершения нет — конкурс остаётся активным, пока ты сам не завершишь его.
      </p>

      {showCreate && (
        <div className="card p-4 mb-5 space-y-3">
          <h2 className="font-semibold text-sm">Новый конкурс</h2>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-white/50 block mb-1">Число победителей</span>
              <input
                type="number"
                min={1}
                max={50}
                value={form.winnersCount}
                onChange={(e) => updateForm("winnersCount", e.target.value)}
                className="input-field w-full"
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/50 block mb-1">Канал (@username или числовой ID)</span>
              <input
                type="text"
                placeholder="@my_channel"
                value={form.channelId}
                onChange={(e) => updateForm("channelId", e.target.value)}
                className="input-field w-full"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-white/50 block mb-1">Текст поста — что разыгрываем, условия и т.п.</span>
            <textarea
              rows={3}
              value={form.text}
              onChange={(e) => updateForm("text", e.target.value)}
              className="input-field w-full resize-none"
            />
          </label>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-white/50 block mb-1">Текст кнопки участия</span>
              <input
                type="text"
                value={form.buttonText}
                onChange={(e) => updateForm("buttonText", e.target.value)}
                className="input-field w-full"
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/50 block mb-1">Цвет подписи под кнопкой</span>
              <select
                value={form.buttonColor}
                onChange={(e) => updateForm("buttonColor", e.target.value)}
                className="input-field w-full"
              >
                {COLOR_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className="text-xs text-white/50 block mb-1">Фото поста (необязательно)</span>
            <ImageUploadField value={form.photoUrl} onChange={(url) => updateForm("photoUrl", url)} folder="contests" size={96} />
          </div>

          <button
            onClick={handleCreate}
            disabled={creating}
            className="btn-primary px-5 py-2.5 text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Gift size={14} /> {creating ? "Публикуем..." : "Создать и опубликовать в канале"}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-white/40 text-sm">Загрузка...</p>
      ) : contests.length === 0 ? (
        <p className="text-white/40 text-sm">Пока нет ни одного конкурса — создай его кнопкой выше или в боте.</p>
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

