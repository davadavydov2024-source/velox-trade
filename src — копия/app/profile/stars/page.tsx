"use client";

import Link from "next/link";
import { Wallet, ChevronRight, Send, CreditCard, ShoppingBag } from "lucide-react";
import { StarsTopUpCard } from "@/components/StarsTopUpCard";

/** Отдельная страница пополнения баланса Telegram Stars (рубли пополняются на /profile/topup). */
export default function StarsPage() {
  const steps = [
    { icon: <Send size={16} />, title: "Выбери сумму", text: "Нажми «Пополнить в Telegram» — откроется бот." },
    { icon: <CreditCard size={16} />, title: "Оплати счёт в боте", text: "Бот пришлёт счёт на выбранную сумму — оплати его звёздами." },
    { icon: <ShoppingBag size={16} />, title: "Покупай за ⭐", text: "Баланс на сайте пополнится сам. На странице товара появится «Оплатить с баланса»." },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Пополнение ⭐</h1>
        <p className="text-sm text-white/40">Баланс Telegram Stars для покупок на сайте.</p>
      </div>

      <StarsTopUpCard />

      <div className="card p-5 space-y-4">
        <p className="text-sm font-semibold">Как это работает</p>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-xl bg-yellow-400/10 border border-yellow-400/25 text-yellow-300 flex items-center justify-center shrink-0">{s.icon}</span>
              <span>
                <span className="block text-sm font-medium">
                  {i + 1}. {s.title}
                </span>
                <span className="block text-xs text-white/45">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <Link href="/profile/topup" className="card p-4 flex items-center gap-3 hover:bg-white/[0.04] transition-colors">
        <span className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
          <Wallet size={18} />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium">Пополнить рубли</span>
          <span className="block text-xs text-white/40">Баланс в ₽ пополняется на отдельной странице</span>
        </span>
        <ChevronRight size={16} className="text-white/25" />
      </Link>
    </div>
  );
}
