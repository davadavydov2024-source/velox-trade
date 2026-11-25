"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { mApi } from "./api";

/**
 * Карточка баланса в профиле, как в Telegram: крупная сумма монет 🪙 и кнопка «Пополнить».
 * Нажатие открывает «Кошелёк» (пополнение, история). `value` — готовая сумма (для превью), иначе грузим с сервера.
 */
export function BalanceCard({ onOpen, value }: { onOpen: () => void; value?: number }) {
  const [wallet, setWallet] = useState<number | null>(value ?? null);

  useEffect(() => {
    if (value !== undefined) return;
    let dead = false;
    const load = () => mApi<{ wallet: number }>("wallet").then((d) => { if (!dead) setWallet(d.wallet); }).catch(() => {});
    load();
    window.addEventListener("focus", load);
    return () => { dead = true; window.removeEventListener("focus", load); };
  }, [value]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="relative overflow-hidden flex items-center gap-3.5 text-left w-full active:scale-[0.99] transition-transform cursor-pointer"
      style={{
        borderRadius: 26,
        padding: "18px 18px",
        background: "linear-gradient(135deg, color-mix(in srgb, var(--mx-accent) 30%, var(--mx-surface)) 0%, var(--mx-surface) 85%)",
        border: "1px solid color-mix(in srgb, var(--mx-accent) 22%, transparent)",
      }}
    >
      <span className="flex items-center justify-center shrink-0 max-[359px]:hidden" style={{ width: 50, height: 50, borderRadius: 16, background: "var(--mx-accent)", color: "var(--mx-accent-text, #fff)", fontSize: 28, lineHeight: 1 }} aria-hidden>🪙</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] mx-muted font-medium">Баланс</span>
        <span className="block font-bold tabular-nums leading-tight whitespace-nowrap" style={{ fontSize: 28 }}>
          {wallet === null ? <span className="inline-block rounded-lg animate-pulse" style={{ width: 90, height: 28, background: "var(--mx-surface3, var(--mx-surface2))" }} /> : wallet.toLocaleString("ru-RU")}
        </span>
      </span>
      <span className="flex items-center gap-1 shrink-0 font-semibold text-[14.5px]" style={{ height: 40, padding: "0 15px 0 11px", borderRadius: 999, background: "var(--mx-accent)", color: "var(--mx-accent-text, #fff)" }}>
        <Plus size={17} strokeWidth={2.6} /> Пополнить
      </span>
    </div>
  );
}
