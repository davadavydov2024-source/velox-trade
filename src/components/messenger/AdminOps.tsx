"use client";

import { useState } from "react";
import { Copy, Search } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { useToast } from "@/lib/toastContext";
import { Avatar, Spinner } from "./ui";

type Acc = { uid: string; handle: string; displayName: string; photoURL: string | null };
type Op = {
  code: string; type: string; typeLabel: string; at: number; from: string | null; to: string | null; amount: number;
  ref?: string; name?: string; extra?: Record<string, unknown>; fromAcc: Acc | null; toAcc: Acc | null;
};

const when = (t: number) => new Date(t).toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "medium" });

/** Расшифровка служебных полей операции для админа. */
function details(op: Op): string[] {
  const e = op.extra ?? {};
  const out: string[] = [];
  if (e.anonymous) out.push("Анонимно: получатель не видит отправителя (вы видите)");
  if (typeof e.nftNumber === "number") out.push(`NFT №${e.nftNumber}`);
  if (typeof e.payout === "number") out.push(`Получил продавец: ${e.payout} 🪙`);
  if (typeof e.fee === "number") out.push(`Комиссия: ${e.fee} 🪙`);
  if (typeof e.days === "number") out.push(`Дней аренды: ${e.days}`);
  if (typeof e.price === "number") out.push(`Цена подарка: ${e.price} 🪙`);
  if (typeof e.rub === "number") out.push(`Оплачено: ${e.rub} ₽`);
  if (e.rollyPaymentId) out.push(`ID платежа: ${String(e.rollyPaymentId)}`);
  if (e.payerTgId) out.push(`Telegram плательщика: ${String(e.payerTgId)}`);
  if (e.telegramChargeId) out.push(`ID платежа Telegram: ${String(e.telegramChargeId)}`);
  return out;
}

/** Вкладка «Операции»: найти операцию по коду (MG-XXXX-XXXX) или все операции человека. */
export function AdminOps() {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [ops, setOps] = useState<Op[] | null>(null);
  const [who, setWho] = useState<Acc | null>(null);

  const copy = (text: string, msg = "Скопировано") => { navigator.clipboard?.writeText(text).then(() => toast("success", msg)).catch(() => {}); };

  async function run(param: string) {
    setBusy(true);
    try {
      const res = await authedFetch(`/api/admin/messenger/ops?${param}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Ошибка");
      setOps(d.ops as Op[]);
      setWho((d.user as Acc | null) ?? null);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  function search() {
    const t = q.trim();
    if (!t) return;
    if (/^mg[\s-]?[a-z0-9]{4}[\s-]?[a-z0-9]{4}$/i.test(t)) return run(`code=${encodeURIComponent(t)}`);
    if (t.startsWith("@")) return run(`handle=${encodeURIComponent(t)}`);
    // ник без @ или ID (человека, подарка, заказа): сначала как ник, если пусто — как ID
    return run(/^[a-z0-9_]{3,32}$/i.test(t) && t.length < 20 ? `handle=${encodeURIComponent(t)}` : `id=${encodeURIComponent(t)}`);
  }

  const person = (a: Acc | null, fallback: string) =>
    a ? (
      <button onClick={() => run(`id=${encodeURIComponent(a.uid)}`)} className="flex items-center gap-2.5 min-w-0 text-left active:opacity-60" title="Показать все операции этого человека">
        <Avatar src={a.photoURL} name={a.displayName || "?"} seed={a.uid} size={36} />
        <span className="min-w-0">
          <span className="block text-[14.5px] font-semibold truncate">{a.displayName || "Без имени"}</span>
          <span className="block text-[12px] mx-muted truncate">{a.handle ? `@${a.handle} · ` : ""}{a.uid.slice(0, 10)}…</span>
        </span>
      </button>
    ) : (
      <span className="text-[14px] mx-muted">{fallback}</span>
    );

  return (
    <div className="space-y-3">
      <div className="mx-card p-3" style={{ borderRadius: 20 }}>
        <p className="text-[13px] mx-muted mb-2">Введите код операции, который прислал пользователь (MG-XXXX-XXXX), или @ник, чтобы увидеть все его операции.</p>
        <div className="flex gap-2">
          <div className="mx-search flex-1 min-w-0" style={{ height: 46 }}>
            <Search size={18} className="mx-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="MG-7K3Q-9XPD или @ник" className="bg-transparent outline-none flex-1 min-w-0 w-full text-[15px]" autoCapitalize="characters" />
          </div>
          <button onClick={search} disabled={busy || !q.trim()} className="mx-btn px-5 shrink-0" style={{ height: 46, width: "auto" }}>{busy ? <Spinner size={16} /> : "Найти"}</button>
        </div>
      </div>

      {who && <p className="text-[13.5px] px-1">Операции: <b>{who.displayName}</b> @{who.handle}</p>}
      {ops && ops.length === 0 && <p className="text-center mx-muted text-[14px] py-8">Ничего не найдено. Старые операции (до появления кодов) искать по коду нельзя: ищите по @нику.</p>}

      {ops?.map((op) => {
        const det = details(op);
        return (
          <div key={op.code} className="mx-card p-4" style={{ borderRadius: 22 }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[15.5px]">{op.typeLabel}</p>
                <p className="mx-muted text-[12.5px] mt-0.5">{when(op.at)}</p>
              </div>
              <button onClick={() => copy(op.code, "Код скопирован")} className="flex items-center gap-1.5 shrink-0 text-[13px] font-semibold px-3 h-8 rounded-full active:opacity-60" style={{ background: "var(--mx-surface2)", color: "var(--mx-accent)" }}>
                {op.code} <Copy size={13} />
              </button>
            </div>

            <div className="mt-3 grid gap-2.5" style={{ gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
              <div className="min-w-0">
                <p className="text-[11.5px] uppercase tracking-wide mx-muted mb-1">От кого</p>
                {person(op.fromAcc, op.type === "topup" ? "Платёжная система" : "MiliGram")}
              </div>
              <span className="mx-muted text-[18px]" aria-hidden>→</span>
              <div className="min-w-0">
                <p className="text-[11.5px] uppercase tracking-wide mx-muted mb-1">Кому</p>
                {person(op.toAcc, "Магазин MiliGram")}
              </div>
            </div>

            <div className="mt-3 pt-3 space-y-1 text-[14px]" style={{ borderTop: "1px solid var(--mx-line)" }}>
              <p><span className="mx-muted">Сумма: </span><b>{op.amount} 🪙</b></p>
              {(op.name || op.ref) && <p><span className="mx-muted">Что: </span>{op.name ?? ""}{op.ref ? <button onClick={() => copy(op.ref!)} className="ml-1 mx-muted text-[12.5px] underline-offset-2 underline">{op.ref}</button> : null}</p>}
              {det.map((d) => <p key={d} className="text-[13.5px]">{d}</p>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
