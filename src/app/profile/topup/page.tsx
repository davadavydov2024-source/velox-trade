"use client";

import { useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, QrCode, Smartphone, ExternalLink, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { createTopUpRequest, getUserTopUpRequests } from "@/lib/users";
import { getFeatureFlags } from "@/lib/featureFlags";
import { TopUpRequest } from "@/types";

const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT || "veloxtrade_robot";

const QUICK_AMOUNTS = [100, 300, 500, 1000, 2000, 5000];

const METHOD_OPTIONS: { value: TopUpRequest["method"]; label: string; icon: typeof QrCode }[] = [
  { value: "qr", label: "QR-код", icon: QrCode },
  { value: "playerok", label: "Playerok", icon: ExternalLink },
  { value: "funpay", label: "FunPay", icon: ExternalLink },
  { value: "phone", label: "По номеру телефона", icon: Smartphone },
];

const STATUS_LABEL: Record<TopUpRequest["status"], { text: string; color: string; icon: typeof Clock }> = {
  pending: { text: "На рассмотрении", color: "#ff9800", icon: Clock },
  approved: { text: "Одобрена", color: "#4caf50", icon: CheckCircle2 },
  rejected: { text: "Отклонена", color: "#f44336", icon: XCircle },
};

export default function TopUpPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [type, setType] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<TopUpRequest["method"]>("qr");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [flagsLoaded, setFlagsLoaded] = useState(false);
  const [requests, setRequests] = useState<TopUpRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  useEffect(() => {
    getFeatureFlags().then((f) => {
      setEnabled(f.balanceTopupEnabled);
      setFlagsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshRequests();
  }, [user]);

  async function refreshRequests() {
    if (!user) return;
    setLoadingRequests(true);
    try {
      setRequests(await getUserTopUpRequests(user.uid));
    } catch (err) {
      console.error("Не удалось загрузить заявки:", err);
    } finally {
      setLoadingRequests(false);
    }
  }

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
        method,
        comment: comment.trim() || undefined,
      });
      toast("success", "Заявка создана. Администратор рассмотрит её и свяжется с тобой.");
      setAmount("");
      setComment("");
      refreshRequests();
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет доступа к базе данных. Проверь, что правила Firestore опубликованы.");
      } else {
        toast("error", "Не удалось создать заявку. Попробуйте снова.");
      }
      console.error(err);
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
              Заявка обрабатывается <strong>вручную администратором</strong> — после отправки жди, пока статус
              изменится на «Одобрена». Переводи деньги только после того, как администратор лично подтвердил
              реквизиты в переписке — никогда не переводи по реквизитам из непроверенных источников.
            </p>
            <a
              href={`https://t.me/${TELEGRAM_BOT}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline mt-2"
            >
              Или обсудить прямо в Telegram-боте <ExternalLink size={12} />
            </a>
          </div>

          <div className="card p-5">
            <div className="flex gap-2 mb-5">
              <button
                type="button"
                onClick={() => setType("deposit")}
                className={`flex-1 py-2.5 rounded-btn text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  type === "deposit" ? "bg-accent text-black" : "bg-surface text-white/60"
                }`}
              >
                <ArrowDownCircle size={16} /> Пополнить
              </button>
              <button
                type="button"
                onClick={() => setType("withdraw")}
                className={`flex-1 py-2.5 rounded-btn text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  type === "withdraw" ? "bg-accent text-black" : "bg-surface text-white/60"
                }`}
              >
                <ArrowUpCircle size={16} /> Вывести
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-white/40 mb-1.5 block">Сумма, ₽</label>
                <input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Например, 500"
                  className="input-field py-2.5 mb-2"
                  required
                />
                <div className="flex flex-wrap gap-2">
                  {QUICK_AMOUNTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAmount(String(a))}
                      className="px-3 py-1.5 rounded-btn text-xs bg-surface text-white/60 hover:bg-accent/15 hover:text-accent transition-colors"
                    >
                      {a} ₽
                    </button>
                  ))}
                </div>
                {type === "withdraw" && profile && (
                  <p className="text-xs text-white/30 mt-1.5">Доступно для вывода: {profile.balance.toFixed(2)} ₽</p>
                )}
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1.5 block">Удобный способ получения реквизитов</label>
                <div className="grid grid-cols-2 gap-2">
                  {METHOD_OPTIONS.map((m) => {
                    const Icon = m.icon;
                    const active = method === m.value;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => setMethod(m.value)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-btn text-xs transition-colors ${
                          active ? "bg-accent/15 text-accent border border-accent/40" : "bg-surface text-white/60 border border-transparent"
                        }`}
                      >
                        <Icon size={14} /> {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1.5 block">Комментарий (необязательно)</label>
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Например, свой ник на Playerok"
                  className="input-field py-2.5"
                />
              </div>

              <button disabled={submitting} className="btn-primary w-full py-3 disabled:opacity-50">
                {submitting ? "Создаём заявку..." : "Создать заявку"}
              </button>
            </form>
          </div>

          <div>
            <h2 className="text-sm font-medium text-white/60 mb-2">Мои заявки</h2>
            {loadingRequests ? (
              <div className="card p-6 text-center text-white/30 text-sm">Загрузка...</div>
            ) : requests.length === 0 ? (
              <div className="card p-6 text-center text-white/30 text-sm">Заявок пока нет</div>
            ) : (
              <div className="space-y-2">
                {requests.map((r) => {
                  const s = STATUS_LABEL[r.status];
                  const StatusIcon = s.icon;
                  return (
                    <div key={r.id} className="card p-3.5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {r.type === "deposit" ? "Пополнение" : "Вывод"} {r.amount} ₽
                        </p>
                        <p className="text-xs text-white/30">{new Date(r.createdAt).toLocaleString("ru-RU")}</p>
                      </div>
                      <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: s.color }}>
                        <StatusIcon size={14} /> {s.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
