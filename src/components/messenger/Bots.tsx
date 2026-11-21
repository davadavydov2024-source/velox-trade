"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Copy, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/lib/toastContext";
import { mApi, MApiError } from "./api";
import { PageHeader, Sheet, Spinner } from "./ui";
import { startTopup } from "./Wallet";

type Reply = { text: string; buttons?: string[] };
type Rule = Reply & { trigger: string };
type BotView = { id: string; handle: string; name: string; description: string; welcome: Reply; fallback: Reply; rules: Rule[]; hostedUntil: number; running: boolean; usersCount: number; messagesCount: number };
type Data = { bots: BotView[]; wallet: number; limit: number; hostPrice: number; hostDays: number; maxRules: number };

const fmtDate = (t: number) => new Date(t).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
const btnsToText = (b?: string[]) => (b ?? []).join(", ");
const textToBtns = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const err = (e: unknown, def: string) => (e instanceof MApiError ? e.message : def);

/** «Боты»: конструктор ботов как @BotFather — создаёшь бота, настраиваешь команды и ответы, запускаешь на хостинге за 🪙. До 4 ботов. */
export function BotsPage({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [create, setCreate] = useState(false);

  const load = useCallback(() => mApi<Data>("bots").then(setData).catch((e) => toast("error", err(e, "Не удалось загрузить ботов"))), [toast]);
  useEffect(() => { load(); }, [load]);

  const bot = data?.bots.find((b) => b.id === openId);
  if (data && bot) return <BotEditor bot={bot} data={data} onBack={() => { setOpenId(null); load(); }} reload={load} />;

  return (
    <>
      <PageHeader title="Боты" onBack={onBack} />
      <div className="mx-scroll flex-1 pb-24">
        <div className="px-4 pt-3 pb-2">
          <div className="mx-card px-4 py-3 text-[13.5px]">
            <p>Создавай своих ботов без кода: задай команды и ответы, и бот будет отвечать всем, кто ему напишет. Ботов: <b>{data ? `${data.bots.length} из ${data.limit}` : "…"}</b> · кошелёк <b>{data?.wallet ?? "…"} 🪙</b></p>
            <p className="mx-muted mt-1">Бот отвечает, пока запущен на хостинге: {data?.hostPrice ?? 20} 🪙 за {data?.hostDays ?? 30} дн. Остановленный бот молчит.</p>
          </div>
        </div>

        {!data ? <div className="flex justify-center py-10"><Spinner /></div> : (
          <>
            {data.bots.map((b) => (
              <button key={b.id} onClick={() => setOpenId(b.id)} className="w-full px-4 py-2.5 flex items-center gap-3 text-left">
                <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--mx-accent)", color: "#fff" }}><Bot size={22} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold truncate">{b.name}</span>
                  <span className="block mx-muted text-[12.5px] truncate">@{b.handle} · {b.running ? `работает до ${fmtDate(b.hostedUntil)}` : "не запущен"} · {b.usersCount} польз.</span>
                </span>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.running ? "#34c759" : "var(--mx-muted)" }} />
              </button>
            ))}
            {data.bots.length === 0 && <p className="mx-muted text-center text-[14px] px-6 py-8">Пока ни одного бота. Создай первого — это займёт минуту.</p>}
            <div className="px-4 pt-3">
              <button disabled={data.bots.length >= data.limit} onClick={() => setCreate(true)} className="w-full h-12 rounded-xl font-semibold flex items-center justify-center gap-2" style={{ background: "var(--mx-accent)", color: "#fff", opacity: data.bots.length >= data.limit ? 0.5 : 1 }}>
                <Plus size={19} /> {data.bots.length >= data.limit ? `Лимит ботов: ${data.limit}` : "Создать бота"}
              </button>
            </div>
          </>
        )}
      </div>
      <CreateSheet open={create} onClose={() => setCreate(false)} onCreated={(id) => { setCreate(false); load().then(() => setOpenId(id)); }} />
    </>
  );
}

function CreateSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await mApi<{ bot: { id: string } }>("bots", { action: "create", name, handle });
      toast("success", "Бот создан");
      setName(""); setHandle("");
      onCreated(r.bot.id);
    } catch (e) { toast("error", err(e, "Не удалось создать бота")); }
    finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Новый бот">
      <div className="px-4 pb-5 space-y-3">
        <div>
          <p className="mx-muted text-[13px] mb-1">Имя бота</p>
          <input className="mx-input w-full" maxLength={32} placeholder="Например: Магазин Вася" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <p className="mx-muted text-[13px] mb-1">@юзернейм (должен заканчиваться на «bot»)</p>
          <input className="mx-input w-full" maxLength={24} autoCapitalize="none" autoCorrect="off" placeholder="vasya_shop_bot" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, ""))} />
        </div>
        <button disabled={busy || name.trim().length < 2 || handle.length < 4} onClick={submit} className="w-full h-12 rounded-xl font-semibold" style={{ background: "var(--mx-accent)", color: "#fff", opacity: busy || name.trim().length < 2 || handle.length < 4 ? 0.5 : 1 }}>{busy ? "Создаю…" : "Создать"}</button>
      </div>
    </Sheet>
  );
}

function ReplyFields({ label, value, onChange }: { label: string; value: Reply; onChange: (v: Reply) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="mx-muted text-[13px]">{label}</p>
      <textarea className="mx-input w-full" rows={3} maxLength={1000} value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} />
      <input className="mx-input w-full" placeholder="Кнопки через запятую (необязательно)" value={btnsToText(value.buttons)} onChange={(e) => onChange({ ...value, buttons: textToBtns(e.target.value) })} />
    </div>
  );
}

function BotEditor({ bot, data, onBack, reload }: { bot: BotView; data: Data; onBack: () => void; reload: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(bot.name);
  const [description, setDescription] = useState(bot.description);
  const [welcome, setWelcome] = useState<Reply>(bot.welcome);
  const [fallback, setFallback] = useState<Reply>(bot.fallback);
  const [rules, setRules] = useState<Rule[]>(bot.rules);
  const [busy, setBusy] = useState("");

  const save = async (quiet = false) => {
    setBusy("save");
    try { await mApi("bots", { action: "update", id: bot.id, name, description, welcome, fallback, rules }); if (!quiet) toast("success", "Сохранено"); reload(); return true; }
    catch (e) { toast("error", err(e, "Не удалось сохранить")); return false; }
    finally { setBusy(""); }
  };
  const host = async () => {
    const renew = bot.running;
    if (!confirm(`${renew ? "Продлить" : "Запустить"} бота на ${data.hostDays} дн. за ${data.hostPrice} 🪙? Деньги спишутся с кошелька.`)) return;
    if (data.wallet < data.hostPrice) {
      toast("error", `Не хватает монет: нужно ${data.hostPrice} 🪙, у тебя ${data.wallet} 🪙`);
      if (confirm("Пополнить кошелёк?")) startTopup(Math.max(10, data.hostPrice - data.wallet)).catch((e) => toast("error", err(e, "Не удалось создать счёт")));
      return;
    }
    if (!(await save(true))) return;
    setBusy("host");
    try { const r = await mApi<{ hostedUntil: number }>("bots", { action: "host", id: bot.id }); toast("success", `Бот работает до ${fmtDate(r.hostedUntil)}`); reload(); }
    catch (e) { toast("error", err(e, "Не удалось запустить")); }
    finally { setBusy(""); }
  };
  const del = async () => {
    if (!confirm(`Удалить бота @${bot.handle}? Юзернейм освободится, оплаченный хостинг не возвращается.`)) return;
    setBusy("del");
    try { await mApi("bots", { action: "delete", id: bot.id }); toast("success", "Бот удалён"); onBack(); }
    catch (e) { toast("error", err(e, "Не удалось удалить")); setBusy(""); }
  };
  const setRule = (i: number, p: Partial<Rule>) => setRules((a) => a.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <>
      <PageHeader title={bot.name} onBack={onBack} />
      <div className="mx-scroll flex-1 pb-24 px-4 pt-3 space-y-4">
        <div className="mx-card px-4 py-3 text-[13.5px] space-y-2">
          <div className="flex items-center gap-2">
            <p className="flex-1 min-w-0"><b>@{bot.handle}</b> · {bot.running ? <span style={{ color: "#34c759" }}>работает до {fmtDate(bot.hostedUntil)}</span> : <span className="mx-muted">не запущен</span>}</p>
            <button aria-label="Скопировать @юзернейм" onClick={() => { try { navigator.clipboard.writeText(`@${bot.handle}`); toast("success", "Скопировано"); } catch { toast("info", `@${bot.handle}`); } }} style={{ color: "var(--mx-accent)" }}><Copy size={18} /></button>
          </div>
          <p className="mx-muted">Пользователей: {bot.usersCount} · сообщений обработано: {bot.messagesCount}. Найти бота можно в поиске по @юзернейму.</p>
          <button disabled={!!busy} onClick={host} className="w-full h-11 rounded-xl font-semibold" style={{ background: "var(--mx-accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}>
            {busy === "host" ? "…" : bot.running ? `Продлить на ${data.hostDays} дн. · ${data.hostPrice} 🪙` : `Запустить на хостинге · ${data.hostPrice} 🪙`}
          </button>
          <p className="mx-muted text-[12.5px]">На кошельке: {data.wallet} 🪙</p>
        </div>

        <div className="space-y-1.5">
          <p className="mx-muted text-[13px]">Имя</p>
          <input className="mx-input w-full" maxLength={32} value={name} onChange={(e) => setName(e.target.value)} />
          <p className="mx-muted text-[13px] pt-1">Описание (видно в профиле бота)</p>
          <input className="mx-input w-full" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <ReplyFields label="Приветствие (на /start и первое сообщение)" value={welcome} onChange={setWelcome} />

        <div className="space-y-2">
          <p className="mx-muted text-[13px]">Команды и ключевые слова ({rules.length}/{data.maxRules})</p>
          <p className="mx-muted text-[12.5px]">Команда — со слэша: <b>/price</b>. Ключевое слово — любое слово или кнопка: бот ответит, если оно есть в сообщении. Команда <b>/help</b> без своего ответа покажет список команд сама.</p>
          {rules.map((r, i) => (
            <div key={i} className="mx-card px-3 py-3 space-y-1.5">
              <div className="flex gap-2">
                <input className="mx-input flex-1" maxLength={32} placeholder="/команда или слово" autoCapitalize="none" value={r.trigger} onChange={(e) => setRule(i, { trigger: e.target.value })} />
                <button aria-label="Удалить команду" onClick={() => setRules((a) => a.filter((_, j) => j !== i))} style={{ color: "var(--mx-danger)" }}><Trash2 size={19} /></button>
              </div>
              <textarea className="mx-input w-full" rows={2} maxLength={1000} placeholder="Ответ бота" value={r.text} onChange={(e) => setRule(i, { text: e.target.value })} />
              <input className="mx-input w-full" placeholder="Кнопки через запятую (необязательно)" value={btnsToText(r.buttons)} onChange={(e) => setRule(i, { buttons: textToBtns(e.target.value) })} />
            </div>
          ))}
          {rules.length < data.maxRules && (
            <button onClick={() => setRules((a) => [...a, { trigger: "", text: "" }])} className="w-full h-11 rounded-xl font-semibold flex items-center justify-center gap-2" style={{ background: "var(--mx-surface)", color: "var(--mx-accent)" }}><Plus size={18} /> Добавить команду</button>
          )}
        </div>

        <ReplyFields label="Если бот не понял сообщение" value={fallback} onChange={setFallback} />

        <button disabled={!!busy} onClick={() => save()} className="w-full h-12 rounded-xl font-semibold" style={{ background: "var(--mx-accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}>{busy === "save" ? "Сохраняю…" : "Сохранить"}</button>
        <button disabled={!!busy} onClick={del} className="w-full h-11 rounded-xl font-semibold" style={{ color: "var(--mx-danger)", background: "var(--mx-surface)" }}>Удалить бота</button>
      </div>
    </>
  );
}
