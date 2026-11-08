"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/lib/toastContext";
import { authedFetch } from "@/lib/authedFetch";
import { Spinner } from "./ui";

type Sug = { name: string; price: number };
type Row = Sug & { on: boolean; base: number };
const guess = (n: string) => { const l = n.length; const p = l <= 2 ? 3000 : l === 3 ? 1000 : l === 4 ? 400 : l === 5 ? 150 : l === 6 ? 80 : 40; return Math.max(10, Math.round(p / 5) * 5); };
const r5 = (n: number) => Math.max(1, Math.round(n / 5) * 5);

async function call<T = any>(body?: unknown): Promise<T> {
  const res = await authedFetch("/api/admin/messenger/usernames", body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Ошибка");
  return d as T;
}

/** Вкладка «Юзернеймы» в админке: придумать имена, добавить в магазин, цены, остатки. */
export function AdminUsernames() {
  const { toast } = useToast();
  const [shop, setShop] = useState<{ name: string; price: number }[] | null>(null);
  const [stats, setStats] = useState({ owned: 0, listed: 0 });
  const [sugs, setSugs] = useState<Row[]>([]);
  const [mul, setMul] = useState(100);
  const [count, setCount] = useState(20);
  const [busy, setBusy] = useState("");
  const [manual, setManual] = useState("");
  const [manualPrice, setManualPrice] = useState("");

  const load = useCallback(async () => {
    try { const d = await call<{ shop: { name: string; price: number }[]; owned: number; listed: number }>(); setShop(d.shop); setStats({ owned: d.owned, listed: d.listed }); }
    catch (e: any) { toast("error", e.message); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setBusy("gen");
    try { const d = await call<{ names: Sug[] }>({ action: "generate", count }); setSugs(d.names.map((n) => ({ ...n, base: n.price, price: r5((n.price * mul) / 100), on: true }))); if (!d.names.length) toast("info", "Свободных вариантов не нашлось, попробуй ещё раз"); }
    catch (e: any) { toast("error", e.message); }
    setBusy("");
  };
  const changeMul = (v: number) => { setMul(v); setSugs((a) => a.map((x) => ({ ...x, price: r5((x.base * v) / 100) }))); };
  const addItems = async (items: Sug[]) => {
    if (!items.length) return;
    setBusy("add");
    try {
      const r = await call<{ added: string[]; skipped: string[]; reasons?: string[] }>({ action: "add", items });
      if (r.added.length) toast("success", `Добавлено в магазин: ${r.added.map((n) => "@" + n).join(", ")}`);
      if (r.skipped.length) toast("error", (r.reasons ?? []).slice(0, 3).join(" · ") || `Не добавлено: ${r.skipped.length}`);
      setSugs((s) => s.filter((x) => !r.added.includes(x.name)));
      load();
    } catch (e: any) { toast("error", e.message); }
    setBusy("");
  };
  const reprice = async (name: string, old: number) => {
    const v = Number(window.prompt(`Новая цена @${name} в 🪙:`, String(old)));
    if (!Number.isInteger(v) || v < 1) return;
    try { await call({ action: "price", name, price: v }); load(); } catch (e: any) { toast("error", e.message); }
  };
  const remove = async (name: string) => {
    if (!window.confirm(`Убрать @${name} из магазина?`)) return;
    try { await call({ action: "remove", name }); load(); } catch (e: any) { toast("error", e.message); }
  };

  return (
    <div className="pb-10">
      <p className="px-4 pt-3 text-[13px] mx-muted">Продано: {stats.owned} · на перепродаже/в аренде: {stats.listed} · в магазине: {shop?.length ?? "…"}</p>

      <p className="px-4 pt-4 pb-2 text-[13px] uppercase tracking-wide mx-muted">Придумать имена</p>
      <div className="px-4 flex flex-col gap-2">
        <div className="flex gap-2 items-center">
          <select className="mx-input" style={{ maxWidth: 110 }} value={count} onChange={(e) => setCount(Number(e.target.value))}>{[10, 20, 30, 40].map((n) => <option key={n} value={n}>{n} имён</option>)}</select>
          <button className="px-4 py-2 rounded-xl text-[14px] font-medium" disabled={busy === "gen"} style={{ background: "var(--mx-accent)", color: "#fff" }} onClick={generate}>{busy === "gen" ? <Spinner /> : "Придумать"}</button>
        </div>
        <label className="flex items-center gap-3 text-[13.5px]"><span className="mx-muted w-28">Цены: {mul}%</span>
          <input type="range" min={20} max={500} step={10} value={mul} onChange={(e) => changeMul(Number(e.target.value))} className="flex-1" /></label>
        <p className="mx-muted text-[12px]">Ползунок меняет все цены в списке сразу (100% — базовая цена по длине имени). Отдельную цену можно поправить вручную.</p>
        <p className="mx-muted text-[12px]">Генератор подбирает свободные имена по шаблонам: короткие произносимые, слова, слово+число. Цена предложена по длине, её можно поменять.</p>
        {sugs.length > 0 && (
          <>
            {sugs.map((s, i) => (
              <div key={s.name} className="flex items-center gap-2">
                <input type="checkbox" checked={s.on} onChange={(e) => setSugs((a) => a.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                <span className="flex-1 text-[15px] font-semibold">@{s.name}</span>
                <input className="mx-input" style={{ width: 90 }} inputMode="numeric" value={s.price} onChange={(e) => setSugs((a) => a.map((x, j) => (j === i ? { ...x, price: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))} />
                <span className="mx-muted">🪙</span>
              </div>
            ))}
            <button className="px-4 py-2.5 rounded-xl font-medium" disabled={busy === "add"} style={{ background: "var(--mx-accent)", color: "#fff" }} onClick={() => addItems(sugs.filter((s) => s.on))}>{busy === "add" ? <Spinner /> : `Добавить выбранные (${sugs.filter((s) => s.on).length}) в магазин`}</button>
          </>
        )}
      </div>

      <p className="px-4 pt-5 pb-2 text-[13px] uppercase tracking-wide mx-muted">Добавить своё имя</p>
      <div className="px-4 flex gap-2">
        <input className="mx-input flex-1" placeholder="например, king" value={manual} maxLength={24} onChange={(e) => setManual(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} />
        <input className="mx-input" style={{ width: 90 }} inputMode="numeric" placeholder={manual.length >= 2 ? String(guess(manual)) : "🪙"} value={manualPrice} onChange={(e) => setManualPrice(e.target.value.replace(/\D/g, ""))} />
        <button className="px-4 rounded-xl font-medium" style={{ background: "var(--mx-accent)", color: "#fff" }} disabled={busy === "add" || manual.length < 2} onClick={async () => { await addItems([{ name: manual, price: Number(manualPrice) || guess(manual) }]); setManual(""); setManualPrice(""); }}>{busy === "add" ? "…" : "Добавить"}</button>
      </div>

      <p className="px-4 pt-5 pb-1 text-[13px] uppercase tracking-wide mx-muted">В магазине</p>
      {!shop ? <div className="flex justify-center py-6"><Spinner /></div> : shop.length === 0 ? <p className="mx-muted px-4 py-3 text-[14px]">Пусто</p> : shop.map((x) => (
        <div key={x.name} className="px-4 py-2 flex items-center gap-3">
          <span className="flex-1 text-[15px] font-semibold">@{x.name}</span>
          <button className="text-[14px] underline" style={{ color: "var(--mx-accent)" }} onClick={() => reprice(x.name, x.price)}>{x.price} 🪙</button>
          <button className="text-[13px]" style={{ color: "var(--mx-danger)" }} onClick={() => remove(x.name)}>Убрать</button>
        </div>
      ))}
    </div>
  );
}
