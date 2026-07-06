"use client";

import { useEffect, useState } from "react";
import { ExternalLink, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { createTopUpRequest } from "@/lib/users";
import { getFeatureFlags } from "@/lib/featureFlags";

const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT || "veloxtrade_robot";

export default function TopUpPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [type, setType] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [flagsLoaded, setFlagsLoaded] = useState(false);

  useEffect(() => {
    getFeatureFlags().then((f) => {
      setEnabled(f.balanceTopupEnabled);
      setFlagsLoaded(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile) return;
    const num = Number(amount);
    if (!num || num <= 0) {
      toast("warning", "Введите корректную сумму");
      return;
    }
    if (type === "withdraw" && num > profile.balance) {
      toast("error", "Сумма вывода больше доступного баланса");
      return;
    }
    setSubmitting(true);
    try {
      await createTopUpRequest({
        userId: user.uid,
        userNick: profile.displayName,
        amount: num,
        type,
      });
      setSubmitted(true);
      toast("success", "Заявка создана. Подтвердите её в Telegram-боте.");
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет доступа к базе данных. Проверь, что правила Firestore опубликованы (см. README).");
      } else {
        toast("error", "Не удалось создать заявку. Попробуйте снова.");
      }
      console.error("createTopUpRequest error:", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-xl font-bold">Пополнение и вывод баланса</h1>

      {!flagsLoaded ? (
        <div className="card p-10 text-center text-white/40">Загрузка...</div>
      ) : !enabled ? (
        <div className="card p-8 text-center">
          <p className="text-white/60">Пополнение и вывод баланса временно отключены администратором.</p>
          <p className="text-white/40 text-sm mt-2">
            Если нужна помощь — напиши в{" "}
            <a href="/support" className="text-accent hover:underline">
              поддержку
            </a>
            .
          </p>
        </div>
      ) : (
        <>
      <div className="card p-5 border border-yellow-500/20 bg-yellow-500/5">
        <p className="text-sm text-white/70 leading-relaxed">
          Баланс пополняется и выводится <strong>вручную через администратора в Telegram</strong>, без автоматического
          платёжного шлюза. Это значит: переводите деньги только после того, как админ в боте подтвердил реквизиты, и
          никогда не переводите по реквизитам, которые пришли не из бота. Если деньги не зачислены в течение
          разумного времени — пишите в{" "}
          <a href="/support" className="text-accent hover:underline">
            поддержку
          </a>
          .
        </p>
      </div>

      <div className="card p-5">
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setType("deposit")}
            className={`flex-1 py-2.5 rounded-btn text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              type === "deposit" ? "bg-accent text-black" : "bg-surface text-white/60"
            }`}
          >
            <ArrowDownCircle size={16} /> Пополнить
          </button>
          <button
            onClick={() => setType("withdraw")}
            className={`flex-1 py-2.5 rounded-btn text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              type === "withdraw" ? "bg-accent text-black" : "bg-surface text-white/60"
            }`}
          >
            <ArrowUpCircle size={16} /> Вывести
          </button>
        </div>

        {submitted ? (
          <div className="text-center py-6">
            <p className="text-white/70 mb-4">
              Заявка отправлена. Перейдите в Telegram-бота и подтвердите ник и сумму — администратор пришлёт реквизиты
              для оплаты (QR-код Playerok/FunPay или номер телефона для перевода).
            </p>
            <a
              href={`https://t.me/${TELEGRAM_BOT}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex items-center gap-2 px-6 py-3"
            >
              Открыть @{TELEGRAM_BOT} <ExternalLink size={16} />
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-white/40 mb-1.5 block">Ваш ник</label>
              <input value={profile?.displayName ?? ""} disabled className="input-field py-2.5 opacity-60" />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1.5 block">Сумма, ₽</label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Например, 500"
                className="input-field py-2.5"
                required
              />
            </div>
            <button disabled={submitting} className="btn-primary w-full py-3 disabled:opacity-50">
              {submitting ? "Создаём заявку..." : "Создать заявку"}
            </button>
          </form>
        )}
      </div>
        </>
      )}
    </div>
  );
}
