"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/lib/toastContext";
import { mApi, MApiError } from "./api";
import { PageHeader, Spinner } from "./ui";

type Row = { id: string; delta: number; type: string; name: string; at: number };
type WalletInfo = { wallet: number; plus: boolean; plusUntil: number | null; messagePrice: number; maxPrice: number; earned: number; log: Row[] };

const LABEL: Record<string, string> = {
  purchase: "Покупка", gift_convert: "Подарок обменян на ⭐", gift_buy: "Покупка подарка", gift_sale: "Продажа подарка", admin_grant: "Начисление от администрации",
  paid_message_in: "Платное сообщение (получено)", paid_message_out: "Платное сообщение (отправлено)", paid_message_refund: "Возврат за сообщение", topup: "Пополнение",
};
const ICON: Record<string, string> = { purchase: "🛍", gift_convert: "🔁", gift_buy: "🎁", gift_sale: "💸", admin_grant: "✨", paid_message_in: "💬", paid_message_out: "💬", paid_message_refund: "↩️", topup: "➕" };

/** Страница «Кошелёк ⭐»: баланс, пополнение, цена за входящие сообщения (Премиум Плюс) и история операций. */
export function WalletPage({ onBack, onOpenPremium }: { onBack: () => void; onOpenPremium: () => void }) {
  const { toast } = useToast();
  const [info, setInfo] = useState<WalletInfo | null>(null);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => mApi<WalletInfo>("wallet").then((d) => { setInfo(d); setPrice(String(d.messagePrice || "")); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const savePrice = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await mApi("wallet", { price: Number(price || 0) });
      toast("success", Number(price || 0) > 0 ? `Теперь сообщения вам стоят ${Number(price)} ⭐` : "Сообщения снова бесплатные");
      load();
    } catch (err) {
      toast("error", err instanceof MApiError ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Кошелёк ⭐" onBack={onBack} />
      <div className="mx-scroll flex-1 pt-4 pb-24 px-4 space-y-4">
        {!info ? <div className="flex justify-center py-10"><Spinner /></div> : (
          <>
            <div className="mx-card px-5 py-6 text-center">
              <p className="mx-muted text-[13px] uppercase tracking-wide">Баланс</p>
              <p className="text-[40px] font-bold leading-none mt-1">{info.wallet} ⭐</p>
              {info.earned > 0 && <p className="mx-muted text-[13.5px] mt-2">Заработано на сообщениях: {info.earned} ⭐</p>}
              <a href="/profile/stars" target="_blank" rel="noreferrer" className="mx-btn mt-4 inline-block w-full text-center">Пополнить ⭐</a>
            </div>

            <div className="mx-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Платные сообщения</p>
                <span className="text-[12px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,180,0,.16)", color: "#ffb400" }}>Премиум Плюс</span>
              </div>
              <p className="mx-muted text-[13.5px]">Установите цену — и каждое входящее сообщение от новых людей будет приносить вам звёзды. Если вы сами ответили человеку, ему можно писать бесплатно.</p>
              {info.plus ? (
                <div className="flex gap-2">
                  <input className="mx-input flex-1" inputMode="numeric" placeholder="0 — бесплатно" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 4))} />
                  <button className="mx-btn" style={{ width: "auto", padding: "0 18px" }} onClick={savePrice} disabled={busy}>{busy ? <Spinner size={16} /> : "Сохранить"}</button>
                </div>
              ) : (
                <button className="mx-btn" onClick={onOpenPremium}>Подключить Премиум Плюс · 49 ⭐</button>
              )}
              {info.plus && <p className="mx-muted text-[12.5px]">От 1 до {info.maxPrice} ⭐ за сообщение. Сейчас: {info.messagePrice > 0 ? `${info.messagePrice} ⭐` : "бесплатно"}.</p>}
            </div>

            <div className="mx-card">
              <p className="px-4 pt-3 pb-1 text-[13px] uppercase tracking-wide mx-muted">Операции</p>
              {info.log.length === 0 && <p className="mx-muted px-4 py-4 text-[14px]">Пока ничего нет</p>}
              {info.log.map((r) => (
                <div key={r.id} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-[22px] w-7 text-center">{ICON[r.type] ?? "⭐"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] truncate">{LABEL[r.type] ?? r.type}{r.name ? ` · ${r.name}` : ""}</p>
                    <p className="mx-muted text-[12px]">{new Date(r.at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</p>
                  </div>
                  <span className="font-semibold shrink-0" style={{ color: r.delta >= 0 ? "#34c759" : "var(--mx-text)" }}>{r.delta > 0 ? "+" : ""}{r.delta} ⭐</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
