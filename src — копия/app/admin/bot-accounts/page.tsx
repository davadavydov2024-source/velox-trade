"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Bot, Link as LinkIcon, KeyRound, Eye, Copy, History, X, ShieldAlert } from "lucide-react";
import { getBotAccounts, createBotAccount, updateBotAccount, deleteBotAccount } from "@/lib/botAccounts";
import { getGames } from "@/lib/products";
import { BotAccount, Game, BotCredentialAccessLogEntry } from "@/types";
import { useToast } from "@/lib/toastContext";
import { auth } from "@/lib/firebase";
import { RobloxUserPreview } from "@/components/RobloxUserPreview";

const EMPTY_FORM = { gameId: "", nickname: "", profileLink: "" };

export default function AdminBotAccountsPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<BotAccount[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [credBot, setCredBot] = useState<BotAccount | null>(null);
  const [credPassword, setCredPassword] = useState("");
  const [credTotp, setCredTotp] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);

  const [revealed, setRevealed] = useState<{ password: string | null; totpCode: string | null; totpSecondsLeft: number | null } | null>(null);
  const [revealing, setRevealing] = useState(false);

  const [logBot, setLogBot] = useState<BotAccount | null>(null);
  const [logs, setLogs] = useState<BotCredentialAccessLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  async function authedPost(url: string, body: unknown) {
    const idToken = await auth.currentUser?.getIdToken();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  }

  function openCredModal(bot: BotAccount) {
    setCredBot(bot);
    setCredPassword("");
    setCredTotp("");
    setRevealed(null);
  }

  async function handleSaveCreds() {
    if (!credBot) return;
    setSavingCreds(true);
    try {
      await authedPost("/api/admin/bot-accounts/set-credentials", { botId: credBot.id, password: credPassword, totpSecret: credTotp });
      toast("success", "Учётные данные сохранены");
      setCredPassword("");
      setCredTotp("");
      await refresh();
    } catch (err: any) {
      toast("error", err.message);
    } finally {
      setSavingCreds(false);
    }
  }

  async function handleReveal() {
    if (!credBot) return;
    setRevealing(true);
    try {
      const data = await authedPost("/api/admin/bot-accounts/reveal-credentials", { botId: credBot.id });
      setRevealed(data);
    } catch (err: any) {
      toast("error", err.message);
    } finally {
      setRevealing(false);
    }
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
    toast("success", "Скопировано");
  }

  async function openLog(bot: BotAccount) {
    setLogBot(bot);
    setLogsLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/bot-accounts/access-log?botId=${bot.id}`, { headers: { Authorization: `Bearer ${idToken}` } });
      const data = await res.json();
      setLogs(data.logs ?? []);
    } finally {
      setLogsLoading(false);
    }
  }

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
                    onClick={() => openCredModal(bot)}
                    title="Учётные данные для входа"
                    className={`p-2 rounded-btn hover:bg-white/5 ${bot.hasCredentials ? "text-accent" : "text-white/40"}`}
                  >
                    <KeyRound size={16} />
                  </button>
                  <button onClick={() => openLog(bot)} title="Лог доступа" className="p-2 rounded-btn hover:bg-white/5 text-white/40">
                    <History size={16} />
                  </button>
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

      {credBot && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setCredBot(null)}>
          <div className="card p-6 max-w-md w-full space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <KeyRound size={18} /> {credBot.nickname}
              </h2>
              <button onClick={() => setCredBot(null)} className="text-white/40 hover:text-white/80">
                <X size={18} />
              </button>
            </div>

            <div className="rounded-btn bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-200 flex gap-2">
              <ShieldAlert size={15} className="shrink-0 mt-0.5" />
              Данные зашифрованы на сервере. Каждый просмотр пароля/кода пишется в лог доступа —
              видно, кто и когда его открывал.
            </div>

            {revealed ? (
              <div className="space-y-3">
                {revealed.password && (
                  <div>
                    <p className="text-xs text-white/40 mb-1">Пароль</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-surface px-3 py-2 rounded-btn text-sm font-mono">{revealed.password}</code>
                      <button onClick={() => copyText(revealed.password!)} className="btn-secondary p-2.5">
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                )}
                {revealed.totpCode && (
                  <div>
                    <p className="text-xs text-white/40 mb-1">Код 2FA (обновляется каждые 30 сек)</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-surface px-3 py-2 rounded-btn text-lg font-mono tracking-[0.3em] text-accent">
                        {revealed.totpCode}
                      </code>
                      <button onClick={() => copyText(revealed.totpCode!)} className="btn-secondary p-2.5">
                        <Copy size={14} />
                      </button>
                    </div>
                    <p className="text-[11px] text-white/30 mt-1">Действует ещё ~{revealed.totpSecondsLeft} сек — если не успел, жми «Показать» ещё раз.</p>
                  </div>
                )}
                <button onClick={handleReveal} disabled={revealing} className="btn-secondary w-full py-2 text-xs disabled:opacity-50">
                  {revealing ? "Обновляем..." : "Обновить код"}
                </button>
              </div>
            ) : (
              <button onClick={handleReveal} disabled={revealing} className="btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                <Eye size={15} /> {revealing ? "Расшифровываем..." : "Показать пароль и код 2FA"}
              </button>
            )}

            <div className="pt-3 border-t border-border space-y-3">
              <p className="text-xs text-white/40">
                {credBot.hasCredentials ? "Обновить сохранённые данные:" : "Учётные данные ещё не заданы:"}
              </p>
              <input
                autoComplete="new-password"
                type="password"
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                placeholder="Новый пароль от аккаунта бота"
                className="input-field py-2 text-sm"
              />
              <input
                autoComplete="off"
                value={credTotp}
                onChange={(e) => setCredTotp(e.target.value)}
                placeholder="2FA-секрет (Base32-ключ из настроек Roblox)"
                className="input-field py-2 text-sm font-mono"
              />
              <button onClick={handleSaveCreds} disabled={savingCreds || (!credPassword && !credTotp)} className="btn-primary w-full py-2.5 text-sm disabled:opacity-50">
                {savingCreds ? "Сохраняем..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {logBot && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setLogBot(null)}>
          <div className="card p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <History size={18} /> Лог доступа — {logBot.nickname}
              </h2>
              <button onClick={() => setLogBot(null)} className="text-white/40 hover:text-white/80">
                <X size={18} />
              </button>
            </div>
            {logsLoading ? (
              <p className="text-sm text-white/40 text-center py-4">Загрузка...</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-white/30 text-center py-4">Пароль/код этого бота ещё никто не смотрел.</p>
            ) : (
              <ul className="space-y-2 max-h-80 overflow-y-auto">
                {logs.map((l) => (
                  <li key={l.id} className="text-sm flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="text-white/70">{l.adminName}</span>
                    <span className="text-xs text-white/30">{new Date(l.at).toLocaleString("ru-RU")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
