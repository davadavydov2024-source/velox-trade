"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Info } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { requestStarsTopup } from "@/lib/starsPayments";

const QUICK = [50, 100, 250, 500, 1000];
const MIN = 10;
const MAX = 10000;

/**
 * Баланс ⭐ и пополнение: сумма → кнопка «Пополнить в Telegram» открывает бота (t.me/bot?start=sttop_…),
 * бот выставляет счёт на эту сумму, а после оплаты звёзды сразу появляются на балансе сайта.
 */
export function StarsTopUpCard() {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState(100);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const startWallet = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const wallet = profile?.starsWallet ?? 0;

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  // После перехода в бота ждём оплату: раз в 4 секунды перечитываем профиль (до 5 минут).
  useEffect(() => {
    if (waiting && wallet > startWallet.current) {
      setWaiting(false);
      if (pollRef.current) clearInterval(pollRef.current);
      toast("success", `Баланс ⭐ пополнен: +${wallet - startWallet.current} ⭐`);
    }
  }, [wallet, waiting, toast]);

  async function handleTopup() {
    const value = custom ? Number(custom) : amount;
    if (!Number.isInteger(value) || value < MIN || value > MAX) {
      toast("warning", `Сумма — целое число от ${MIN} до ${MAX} ⭐`);
      return;
    }
    setBusy(true);
    const res = await requestStarsTopup(value);
    setBusy(false);
    if (!res.ok) {
      toast("error", res.message);
      return;
    }
    startWallet.current = wallet;
    setWaiting(true);
    const started = Date.now();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      refreshProfile();
      if (Date.now() - started > 5 * 60 * 1000) {
        if (pollRef.current) clearInterval(pollRef.current);
        setWaiting(false);
      }
    }, 4000);
    // Открываем бота; если всплывающее окно заблокировано — переходим в той же вкладке.
    const w = window.open(res.url, "_blank");
    if (!w) window.location.href = res.url;
  }

  return (
    <div className="card p-5 relative overflow-hidden" id="stars">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(circle at 85% 0%, rgba(250,204,21,0.14), transparent 60%)" }}
      />
      <div className="relative space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-white/40 mb-1">Баланс Telegram Stars</p>
            <p className="text-3xl font-extrabold text-yellow-300 leading-none">
              {wallet} <span className="text-xl font-bold">⭐</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-yellow-400/10 border border-yellow-400/25 flex items-center justify-center shrink-0">
            <Sparkles size={22} className="text-yellow-300" />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setAmount(q);
                setCustom("");
              }}
              className={`px-3.5 py-1.5 rounded-full text-sm transition-colors ${
                !custom && amount === q ? "bg-yellow-400 text-black font-semibold" : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              {q} ⭐
            </button>
          ))}
          <input
            inputMode="numeric"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="Своя сумма"
            className="input-field py-1.5 px-3 text-sm w-32"
          />
        </div>

        <button
          type="button"
          onClick={handleTopup}
          disabled={busy}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Send size={16} /> {busy ? "Открываем бота..." : `Пополнить ${custom || amount} ⭐ в Telegram`}
        </button>

        {waiting && <p className="text-xs text-yellow-300/80 text-center">Ждём оплату в боте — баланс обновится сам, как только она пройдёт.</p>}

        <p className="text-[11px] text-white/35 flex items-start gap-1.5">
          <Info size={12} className="shrink-0 mt-0.5" />
          Кнопка откроет бота: он пришлёт счёт на выбранную сумму. Звёзды с баланса тратятся на товары за ⭐ («Оплатить с баланса» на странице товара) и не выводятся.
          Звёзды, заработанные продажами, выводятся отдельно — в боте.
        </p>
      </div>
    </div>
  );
}
