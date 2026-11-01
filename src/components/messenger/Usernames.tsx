"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/lib/toastContext";
import { mApi, MApiError } from "./api";
import { PageHeader, Spinner } from "./ui";

type Item = { name: string; price?: number; perDay?: number; mine?: boolean; rentedUntil?: number | null; byMe?: boolean; role?: "owner" | "renter"; using?: boolean; salePrice?: number | null; rentPerDay?: number | null; rentedOut?: boolean; rentUntil?: number | null };
type Data = { items: Item[]; wallet: number; handle: string; fee: number; rentDaysMax: number };
const VIEWS = [["shop", "Магазин"], ["market", "Рынок"], ["rent", "Аренда"], ["mine", "Мои"]] as const;
type View = (typeof VIEWS)[number][0];
const left = (t: number) => { const d = Math.ceil((t - Date.now()) / 86_400_000); return d > 1 ? `ещё ${d} дн.` : "до завтра"; };

/** «Юзернеймы»: магазин коллекционных @имён за ⭐, перепродажа между людьми и аренда. */
export function UsernamesPage({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [view, setView] = useState<View>("shop");
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState("");
  const [minP, setMinP] = useState("");
  const [maxP, setMaxP] = useState("");
  const [len, setLen] = useState(0); // 0 — любая, 5 — «5 и больше»
  const [sort, setSort] = useState<"len" | "asc" | "desc">("len");

  const load = useCallback(() => {
    setData(null);
    mApi<Data>(`usernames?view=${view}`).then(setData).catch((e) => toast("error", e instanceof MApiError ? e.message : "Не удалось загрузить"));
  }, [view, toast]);
  useEffect(() => { load(); }, [load]);

  const act = async (action: string, name: string, extra: Record<string, unknown> = {}, ok = "Готово") => {
    if (busy) return;
    setBusy(name + action);
    try { await mApi("usernames", { action, name, ...extra }); toast("success", ok); load(); }
    catch (e) { toast("error", e instanceof MApiError ? e.message : "Не удалось"); }
    finally { setBusy(""); }
  };
  const ask = (text: string, def = "") => { const v = window.prompt(text, def); const n = Number(v); return v && Number.isInteger(n) && n > 0 ? n : null; };

  const Btn = ({ children, onClick, id, ghost }: { children: React.ReactNode; onClick: () => void; id: string; ghost?: boolean }) => (
    <button disabled={!!busy} onClick={onClick} className="px-3 py-1.5 rounded-full text-[13.5px] font-semibold shrink-0" style={ghost ? { background: "var(--mx-surface)", color: "var(--mx-text)", opacity: busy ? 0.6 : 1 } : { background: "var(--mx-accent)", color: "#fff", opacity: busy ? 0.6 : 1 }}>{busy === id ? "…" : children}</button>
  );

  const items = (data?.items ?? [])
    .filter((x) => {
      if (view === "mine") return true;
      const p = x.price ?? x.perDay ?? 0;
      if (minP && p < Number(minP)) return false;
      if (maxP && p > Number(maxP)) return false;
      if (len === 5 ? x.name.length < 5 : len > 0 && x.name.length !== len) return false;
      return true;
    })
    .sort((a, b) => (view === "mine" || sort === "len" ? 0 : ((a.price ?? a.perDay ?? 0) - (b.price ?? b.perDay ?? 0)) * (sort === "asc" ? 1 : -1)));

  return (
    <>
      <PageHeader title="Юзернеймы" onBack={onBack} />
      <div className="mx-scroll flex-1 pb-24">
        <div className="px-4 pt-3 pb-2">
          <div className="mx-card px-4 py-3 text-[13.5px]">
            <p>Твой @ник: <b>@{data?.handle ?? "…"}</b> · баланс <b>{data?.wallet ?? "…"} ⭐</b></p>
            <p className="mx-muted mt-1">Короткие и красивые @имена. Купленное имя твоё: его можно использовать вместо обычного, перепродать или сдать в аренду. Комиссия с продаж и аренды — {data?.fee ?? 10}%.</p>
          </div>
        </div>
        <div className="px-4 flex gap-1.5 overflow-x-auto mx-scroll-x pb-2">
          {VIEWS.map(([id, l]) => <button key={id} onClick={() => setView(id)} className="px-3.5 py-1.5 rounded-full text-[14px] font-semibold whitespace-nowrap" style={{ background: view === id ? "var(--mx-surface)" : "transparent", color: view === id ? "var(--mx-text)" : "var(--mx-muted)" }}>{l}</button>)}
        </div>

        {view !== "mine" && (
          <div className="px-4 pb-2 flex flex-wrap gap-2 items-center text-[13.5px]">
            <input className="mx-input" style={{ width: 78 }} inputMode="numeric" placeholder="от ⭐" value={minP} onChange={(e) => setMinP(e.target.value.replace(/\D/g, ""))} />
            <input className="mx-input" style={{ width: 78 }} inputMode="numeric" placeholder="до ⭐" value={maxP} onChange={(e) => setMaxP(e.target.value.replace(/\D/g, ""))} />
            <select className="mx-input" style={{ width: 112 }} value={len} onChange={(e) => setLen(Number(e.target.value))}>
              <option value={0}>Любая длина</option><option value={2}>2 буквы</option><option value={3}>3 буквы</option><option value={4}>4 буквы</option><option value={5}>5 и больше</option>
            </select>
            <select className="mx-input" style={{ width: 128 }} value={sort} onChange={(e) => setSort(e.target.value as "len" | "asc" | "desc")}>
              <option value="len">Сначала короткие</option><option value="asc">Дешевле</option><option value="desc">Дороже</option>
            </select>
            {(minP || maxP || len > 0) && <button className="mx-muted underline" onClick={() => { setMinP(""); setMaxP(""); setLen(0); }}>Сбросить</button>}
          </div>
        )}
        {!data ? <div className="flex justify-center py-10"><Spinner /></div> : items.length === 0 ? (
          <p className="mx-muted text-center text-[14px] px-6 py-10">{view === "shop" ? "Сейчас в магазине пусто — загляни позже" : view === "mine" ? "У тебя пока нет юзернеймов. Купи первый в магазине." : "Пока ничего нет"}</p>
        ) : items.map((x) => (
          <div key={x.name} className="px-4 py-2.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold truncate">@{x.name}</p>
              <p className="mx-muted text-[12.5px] truncate">
                {view === "shop" && `${x.price} ⭐`}
                {view === "market" && `${x.price} ⭐${x.mine ? " · твой" : ""}`}
                {view === "rent" && `${x.perDay} ⭐ / день${x.rentedUntil ? ` · занят, ${left(x.rentedUntil)}` : ""}${x.mine ? " · твой" : ""}`}
                {view === "mine" && [x.role === "renter" ? `аренда, ${left(x.rentUntil ?? 0)}` : "куплен", x.using ? "используется" : "", x.salePrice ? `продаётся за ${x.salePrice} ⭐` : "", x.rentPerDay ? `сдаётся по ${x.rentPerDay} ⭐/день` : "", x.rentedOut && x.role === "owner" ? `сдан, ${left(x.rentUntil ?? 0)}` : ""].filter(Boolean).join(" · ")}
              </p>
            </div>
            {view === "shop" && <Btn id={x.name + "buy"} onClick={() => window.confirm(`Купить @${x.name} за ${x.price} ⭐?`) && act("buy", x.name, {}, `@${x.name} теперь твой`)}>Купить</Btn>}
            {view === "market" && !x.mine && <Btn id={x.name + "buy-resale"} onClick={() => window.confirm(`Купить @${x.name} за ${x.price} ⭐?`) && act("buy-resale", x.name, {}, `@${x.name} теперь твой`)}>Купить</Btn>}
            {view === "rent" && !x.mine && (!x.rentedUntil || x.byMe) && <Btn id={x.name + "rent"} onClick={() => { const d = ask(`Сколько дней арендовать @${x.name}? (1–${data.rentDaysMax}, ${x.perDay} ⭐ в день)`, "7"); if (d) act("rent", x.name, { days: d }, `@${x.name} арендован`); }}>{x.byMe ? "Продлить" : "Арендовать"}</Btn>}
            {view === "mine" && (
              <div className="flex flex-wrap gap-1.5 justify-end max-w-[210px]">
                {x.using ? <Btn ghost id={x.name + "deactivate"} onClick={() => act("deactivate", x.name, {}, "Вернулся обычный @ник")}>Не использовать</Btn> : (x.role === "renter" || (!x.rentPerDay && !x.rentedOut)) && <Btn id={x.name + "activate"} onClick={() => act("activate", x.name, {}, `Теперь твой ник — @${x.name}`)}>Использовать</Btn>}
                {x.role === "owner" && (x.salePrice ? <Btn ghost id={x.name + "unlist-sale"} onClick={() => act("unlist-sale", x.name, {}, "Снято с продажи")}>Снять с продажи</Btn> : !x.rentedOut && <Btn ghost id={x.name + "list-sale"} onClick={() => { const p = ask(`Цена продажи @${x.name} в ⭐ (тебе достанется на ${data.fee}% меньше):`); if (p) act("list-sale", x.name, { price: p }, "Выставлено на продажу"); }}>Продать</Btn>)}
                {x.role === "owner" && (x.rentPerDay ? <Btn ghost id={x.name + "unlist-rent"} onClick={() => act("unlist-rent", x.name, {}, "Снято с аренды")}>Снять с аренды</Btn> : <Btn ghost id={x.name + "list-rent"} onClick={() => { const p = ask(`Цена аренды @${x.name} в ⭐ за день:`); if (p) act("list-rent", x.name, { price: p }, "Выставлено в аренду"); }}>Сдать</Btn>)}
              </div>
            )}
          </div>
        ))}
        {view === "shop" && <p className="mx-muted text-[12px] px-4 pt-3">Не хватает ⭐? Пополни кошелёк в разделе «Кошелёк ⭐».</p>}
      </div>
    </>
  );
}

/** Коллекционные @юзернеймы человека в его профиле (как «также» в Telegram): видно цену, если продаётся, и можно купить. */
export function ExtraUsernames({ uid }: { uid: string }) {
  const { toast } = useToast();
  const [items, setItems] = useState<{ name: string; price: number | null; rentPerDay: number | null; mine: boolean }[]>([]);
  const [busy, setBusy] = useState("");
  const load = useCallback(() => { mApi<{ items: typeof items }>(`usernames?view=of&uid=${encodeURIComponent(uid)}`).then((d) => setItems(d.items ?? [])).catch(() => setItems([])); }, [uid]);
  useEffect(() => { load(); }, [load]);
  if (items.length === 0) return null;
  return (
    <div className="px-4 py-3">
      <p className="mx-muted text-[12.5px] mb-1">Коллекционные юзернеймы</p>
      {items.map((x) => (
        <div key={x.name} className="flex items-center gap-2 py-1">
          <span className="min-w-0 flex-1"><span style={{ color: "var(--mx-accent)" }}>@{x.name}</span> <span className="mx-muted text-[12.5px]">{x.price ? `· продаётся за ${x.price} ⭐` : x.rentPerDay ? `· аренда ${x.rentPerDay} ⭐/день` : "· не продаётся"}</span></span>
          {!x.mine && x.price ? <button disabled={!!busy} className="px-3 py-1 rounded-full text-[13px] font-semibold" style={{ background: "var(--mx-accent)", color: "#fff" }} onClick={async () => {
            if (!window.confirm(`Купить @${x.name} за ${x.price} ⭐?`)) return;
            setBusy(x.name);
            try { await mApi("usernames", { action: "buy-resale", name: x.name }); toast("success", `@${x.name} теперь твой`); load(); } catch (e) { toast("error", e instanceof MApiError ? e.message : "Не удалось купить"); }
            setBusy("");
          }}>Купить</button> : null}
        </div>
      ))}
    </div>
  );
}
