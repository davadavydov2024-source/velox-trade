"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Bot, Link as LinkIcon } from "lucide-react";
import { getBotAccounts, createBotAccount, updateBotAccount, deleteBotAccount } from "@/lib/botAccounts";
import { getGames } from "@/lib/products";
import { BotAccount, Game } from "@/types";
import { useToast } from "@/lib/toastContext";
import { RobloxUserPreview } from "@/components/RobloxUserPreview";

const EMPTY_FORM = { gameId: "", nickname: "", profileLink: "" };

export default function AdminBotAccountsPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<BotAccount[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    refresh();
    getGames().then(setGames).catch(() => setGames([]));
  }, []);

  async function refresh() {
    setLoading(true);
    setAccounts(await getBotAccounts());
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.gameId || !form.nickname.trim()) {
      toast("warning", "Выбери игру и укажи ник бота-посредника");
      return;
    }
    try {
      await createBotAccount({
        gameId: form.gameId,
        nickname: form.nickname.trim(),
        profileLink: form.profileLink.trim() || undefined,
        active: true,
      });
      toast("success", "Бот-посредник добавлен");
      setForm(EMPTY_FORM);
      setShowForm(false);
      await refresh();
    } catch {
      toast("error", "Не удалось добавить бота");
    }
  }

  async function handleToggleActive(bot: BotAccount) {
    await updateBotAccount(bot.id, { active: !bot.active });
    await refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить этого бота-посредника? Новые выдачи на него больше назначаться не будут.")) return;
    await deleteBotAccount(id);
    await refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Bot size={22} /> Боты-посредники
          </h1>
          <p className="text-sm text-white/40 max-w-2xl">
            Игровые аккаунты, через которые проходит передача предметов между продавцом и покупателем (эскроу).
            Продавец передаёт предмет НА этот аккаунт внутри самой игры, ты вручную это проверяешь и подтверждаешь
            в разделе «Выдача товаров» — автоматики тут нет, готового API для передачи предметов внутри игр обычно
            нет. Для каждой игры нужен хотя бы один активный бот, иначе покупатели не смогут начать выдачу.
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary px-4 py-2.5 flex items-center gap-2 shrink-0">
          <Plus size={16} /> Добавить бота
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 space-y-3">
          <select
            required
            value={form.gameId}
            onChange={(e) => setForm({ ...form, gameId: e.target.value })}
            className="input-field py-2.5 text-sm w-full"
          >
            <option value="">Выбери игру...</option>
            {games.map((g) => (
              <option key={g.id} value={g.slug}>
                {g.name}
              </option>
            ))}
          </select>
          <input
            autoComplete="off"
            required
            value={form.nickname}
            onChange={(e) => setForm({ ...form, nickname: e.target.value })}
            placeholder="Ник аккаунта-посредника в игре"
            className="input-field py-2.5 text-sm w-full"
          />
          <RobloxUserPreview username={form.nickname} />
          <input
            autoComplete="off"
            value={form.profileLink}
            onChange={(e) => setForm({ ...form, profileLink: e.target.value })}
            placeholder="Ссылка на профиль (необязательно)"
            className="input-field py-2.5 text-sm w-full"
          />
          <div className="flex gap-2">
            <button className="btn-primary px-5 py-2.5 text-sm">Добавить</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary px-5 py-2.5 text-sm">
              Отмена
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="card p-10 text-center text-white/40">Загрузка...</div>
      ) : accounts.length === 0 ? (
        <div className="card p-10 text-center text-white/40">
          Ботов пока нет — без хотя бы одного активного бота на игру выдача товаров для неё не запустится.
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((bot) => {
            const game = games.find((g) => g.slug === bot.gameId);
            return (
              <div key={bot.id} className={`card p-4 flex items-center justify-between gap-4 ${!bot.active ? "opacity-40" : ""}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-10 h-10 rounded-btn bg-black/30 flex items-center justify-center shrink-0">
                    <Bot size={18} className="text-accent" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{bot.nickname}</p>
                    <p className="text-xs text-white/40 truncate">
                      {game?.name ?? bot.gameId}
                      {bot.profileLink && (
                        <>
                          {" · "}
                          <a href={bot.profileLink} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">
                            <LinkIcon size={10} /> профиль
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggleActive(bot)}
                    className={`px-3 py-1.5 rounded-btn text-xs font-medium ${bot.active ? "bg-accent/15 text-accent" : "bg-white/10 text-white/50"}`}
                  >
                    {bot.active ? "Активен" : "Выключен"}
                  </button>
                  <button onClick={() => handleDelete(bot.id)} className="p-2 rounded-btn hover:bg-white/5 text-red-400">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
