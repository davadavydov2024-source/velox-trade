"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  QrCode,
  Smartphone,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  CreditCard,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { createTopUpRequest, getUserTopUpRequests, getPendingPayouts } from "@/lib/users";
import { createPayment, getUserPayments, watchPayment, cancelPayment, cancelPaymentBeacon, sweepExpiredPayments } from "@/lib/payments";
import { getFeatureFlags } from "@/lib/featureFlags";
import { TopUpRequest, Payment, SiteScreen } from "@/types";
import { useSearchParams } from "next/navigation";
import { getSiteScreen } from "@/lib/siteScreens";
import { SiteScreenView } from "@/components/SiteScreenView";
import { auth as firebaseAuth } from "@/lib/firebase";

const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT || "veloxtrade_robot";

const QUICK_AMOUNTS = [100, 300, 500, 1000, 2000, 5000];
const MIN_WITHDRAW_AMOUNT = 800;

const METHOD_OPTIONS: { value: TopUpRequest["method"]; label: string; icon: typeof QrCode }[] = [
  { value: "qr", label: "QR-код", icon: QrCode },
  { value: "playerok", label: "Playerok", icon: ExternalLink },
  { value: "funpay", label: "FunPay", icon: ExternalLink },
  { value: "phone", label: "По номеру телефона", icon: Smartphone },
];

const TOPUP_STATUS_LABEL: Record<TopUpRequest["status"], { text: string; color: string; icon: typeof Clock }> = {
  pending: { text: "На рассмотрении", color: "#ff9800", icon: Clock },
  approved: { text: "Одобрена", color: "#4caf50", icon: CheckCircle2 },
  rejected: { text: "Отклонена", color: "#f44336", icon: XCircle },
};

const PAYMENT_STATUS_LABEL: Record<Payment["status"], { text: string; color: string; icon: typeof Clock }> = {
  pending: { text: "Ждём оплату", color: "#ff9800", icon: Clock },
  paid: { text: "Оплачен", color: "#4caf50", icon: CheckCircle2 },
  failed: { text: "Не оплачен", color: "#f44336", icon: XCircle },
  cancelled: { text: "Отменён", color: "#9aa3b2", icon: XCircle },
};

function TopUpPageInner() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [enabled, setEnabled] = useState(true);
  const [flagsLoaded, setFlagsLoaded] = useState(false);
  const [closedScreen, setClosedScreen] = useState<SiteScreen | null>(null);

  useEffect(() => {
    getSiteScreen("topup").then((s) => setClosedScreen(s?.enabled ? s : null));
  }, []);

  const [depositAmount, setDepositAmount] = useState("");
  const [payingNow, setPayingNow] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const pendingOrderIdRef = useRef<string | null>(null);
  const idTokenRef = useRef<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [method, setMethod] = useState<TopUpRequest["method"]>("qr");
  const [comment, setComment] = useState("");
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);
  const [requests, setRequests] = useState<TopUpRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [minTopup, setMinTopup] = useState(100);
  const [pendingPayouts, setPendingPayouts] = useState<{ orderId: string; amount: number; releaseAt: number }[]>([]);

  useEffect(() => {
    getFeatureFlags().then((f) => {
      setEnabled(f.balanceTopupEnabled);
      setMinTopup(f.minTopupAmountRub || 100);
      setFlagsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshPayments();
    refreshRequests();
    getPendingPayouts(user.uid).then(setPendingPayouts).catch(() => {});
  }, [user]);

  useEffect(() => {
    const orderId = searchParams.get("order_id");
    if (!orderId) return;
    setPendingOrderId(orderId);
    firebaseAuth.currentUser?.getIdToken().then((t) => { idTokenRef.current = t; }).catch(() => {});
    const unsub = watchPayment(orderId, (payment) => {
      if (payment?.status === "paid") {
        toast("success", `Баланс пополнен на ${payment.amount} ₽!`);
        refreshProfile();
        refreshPayments();
        setPendingOrderId(null);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    pendingOrderIdRef.current = pendingOrderId;
  }, [pendingOrderId]);

  // Автоотмена, если пользователь ушёл со страницы оплаты, не завершив её.
  // Срабатывает, когда пользователь уже вернулся к нам с ?order_id= (то есть реально
  // побывал на странице оплаты), а не в момент самого перехода туда — тот переход
  // трогать нельзя, иначе платёж отменится раньше, чем человек успеет заплатить.
  useEffect(() => {
    function activeCancel() {
      const orderId = pendingOrderIdRef.current;
      if (!orderId) return;
      handleCancelPayment(orderId, { silent: true });
    }
    function beaconCancelOnUnload() {
      const orderId = pendingOrderIdRef.current;
      const idToken = idTokenRef.current;
      if (!orderId || !idToken) return;
      cancelPaymentBeacon(orderId, idToken);
    }
    function visibilityHandler() {
      if (document.visibilityState === "visible") activeCancel();
    }
    // Вернулись на вкладку (свернули/открыли другую и вернулись, либо нажали "назад" со
    // страницы оплаты) — сразу перепроверяем и отменяем, если платёж всё ещё висит.
    document.addEventListener("visibilitychange", visibilityHandler);
    window.addEventListener("pageshow", activeCancel);
    // Закрывают вкладку/уходят на другой сайт — fetch может не успеть, поэтому используем
    // sendBeacon, который браузер гарантированно отправляет даже во время выгрузки страницы.
    window.addEventListener("pagehide", beaconCancelOnUnload);
    return () => {
      document.removeEventListener("visibilitychange", visibilityHandler);
      window.removeEventListener("pageshow", activeCancel);
      window.removeEventListener("pagehide", beaconCancelOnUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshPayments() {
    if (!user) return;
    setLoadingPayments(true);
    try {
      await sweepExpiredPayments().catch(() => {});
      setPayments(await getUserPayments(user.uid));
    } catch (err) {
      console.error("Не удалось загрузить платежи:", err);
    } finally {
      setLoadingPayments(false);
    }
  }

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

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(depositAmount);
    if (!num || num < minTopup) {
      toast("warning", `Минимальная сумма пополнения — ${minTopup} ₽`);
      return;
    }
    setPayingNow(true);
    try {
      const { url } = await createPayment(num);
      window.location.href = url;
    } catch (err: any) {
      toast("error", err?.message || "Не удалось создать платёж");
      setPayingNow(false);
    }
  }

  async function handleCancelPayment(orderId: string, opts?: { silent?: boolean }) {
    const silent = opts?.silent ?? false;
    if (!silent) setCancellingId(orderId);
    try {
      await cancelPayment(orderId);
      if (!silent) toast("success", "Платёж отменён");
      if (pendingOrderId === orderId) setPendingOrderId(null);
      refreshPayments();
    } catch (err: any) {
      // В тихом режиме (авто-отмена при уходе со страницы) не показываем ошибку — платёж мог
      // уже оплатиться или отмениться раньше, это ожидаемо и не требует внимания пользователя.
      if (!silent) toast("error", err?.message || "Не удалось отменить платёж");
      refreshPayments(); // на случай, если сервер уже зачислил баланс (оплата пришла раньше отмены)
      refreshProfile();
    } finally {
      if (!silent) setCancellingId(null);
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile) return;
    const num = Number(withdrawAmount);
    if (!num || num <= 0) {
      toast("warning", "Введите корректную сумму");
      return;
    }
    if (num > profile.balance) {
      toast("error", "Сумма вывода больше доступного баланса");
      return;
    }
    if (num < MIN_WITHDRAW_AMOUNT) {
      toast("warning", `Минимальная сумма вывода — ${MIN_WITHDRAW_AMOUNT} ₽`);
      return;
    }
    setSubmittingWithdraw(true);
    try {
      await createTopUpRequest({
        userId: user.uid,
        userNick: profile.displayName,
        amount: num,
        type: "withdraw",
        method,
        comment: comment.trim() || undefined,
      });
      toast("success", "Заявка на вывод создана. Администратор рассмотрит её.");
      setWithdrawAmount("");
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
      setSubmittingWithdraw(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-xl font-bold">Пополнение и вывод баланса</h1>

      {closedScreen ? (
        <SiteScreenView screen={closedScreen} />
      ) : !flagsLoaded ? (
        <div className="card p-10 text-center text-white/40">Загрузка...</div>
      ) : !enabled ? (
        <div className="card p-8 text-center">
          <p className="text-white/60">Пополнение и вывод баланса временно отключены администратором.</p>
          <p className="text-white/40 text-sm mt-2">
            Если нужна помощь — напиши в{" "}
            <a href="/chats?tab=support" className="text-accent hover:underline">
              поддержку
            </a>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("deposit")}
              className={`flex-1 py-2.5 rounded-btn text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                tab === "deposit" ? "bg-accent text-black" : "bg-surface text-white/60"
              }`}
            >
              <ArrowDownCircle size={16} /> Пополнить
            </button>
            <button
              type="button"
              onClick={() => setTab("withdraw")}
              className={`flex-1 py-2.5 rounded-btn text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                tab === "withdraw" ? "bg-accent text-black" : "bg-surface text-white/60"
              }`}
            >
              <ArrowUpCircle size={16} /> Вывести
            </button>
          </div>

          {tab === "deposit" ? (
            <>
              <div className="card p-5 border border-yellow-500/20 bg-yellow-500/5">
                <p className="text-sm text-white/70 leading-relaxed">
                  Оплата принимается через платёжную систему{" "}
                  <a href="https://rollypay.io" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    RollyPay
                  </a>{" "}
                  (СБП, карты, крипта). Нажимая «Оплатить», вы соглашаетесь с тем, что за проведение платежа (в том
                  числе за сроки зачисления, работу выбранного способа оплаты и возможные технические сбои) отвечает
                  сама платёжная система rollypay.io, а не Velox Trade. Баланс зачисляется автоматически после
                  подтверждения оплаты.
                </p>
              </div>

              {pendingOrderId && (
                <div className="card p-4 border border-accent/30 bg-accent/5 flex items-center gap-3">
                  <Clock size={18} className="text-accent shrink-0 animate-pulse" />
                  <p className="text-sm text-white/70">
                    Ждём подтверждения оплаты — обычно занимает несколько секунд. Страница обновится автоматически.
                  </p>
                </div>
              )}

              <div className="card p-5">
                <form onSubmit={handlePay} className="space-y-4">
                  <div>
                    <label className="text-xs text-white/40 mb-1.5 block">Сумма, ₽ (минимум {minTopup})</label>
                    <input
            autoComplete="off"
                      type="number"
                      min={minTopup}
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="Например, 500"
                      className="input-field py-2.5 mb-2"
                      required
                    />
                    <div className="flex flex-wrap gap-2">
                      {QUICK_AMOUNTS.map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setDepositAmount(String(a))}
                          className="px-3 py-1.5 rounded-btn text-xs bg-surface text-white/60 hover:bg-accent/15 hover:text-accent transition-colors"
                        >
                          {a} ₽
                        </button>
                      ))}
                    </div>
                  </div>
                  <button disabled={payingNow} className="btn-primary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50">
                    <CreditCard size={16} /> {payingNow ? "Переходим к оплате..." : "Оплатить картой / СБП"}
                  </button>
                </form>
              </div>

              <div>
                <h2 className="text-sm font-medium text-white/60 mb-2">История пополнений</h2>
                {loadingPayments ? (
                  <div className="card p-6 text-center text-white/30 text-sm">Загрузка...</div>
                ) : payments.length === 0 ? (
                  <div className="card p-6 text-center text-white/30 text-sm">Пополнений пока не было</div>
                ) : (
                  <div className="space-y-2">
                    {payments.map((p) => {
                      const s = PAYMENT_STATUS_LABEL[p.status];
                      const StatusIcon = s.icon;
                      return (
                        <div key={p.id} className="card p-3.5 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{p.amount} ₽</p>
                            <p className="text-xs text-white/30">{new Date(p.createdAt).toLocaleString("ru-RU")}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: s.color }}>
                              <StatusIcon size={14} /> {s.text}
                            </span>
                            {p.status === "pending" && (
                              <button
                                onClick={() => handleCancelPayment(p.id)}
                                disabled={cancellingId === p.id}
                                className="text-xs text-white/40 hover:text-red-400 underline underline-offset-2 disabled:opacity-50"
                              >
                                {cancellingId === p.id ? "Отменяем..." : "Отменить"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="card p-5 border border-yellow-500/20 bg-yellow-500/5">
                <p className="text-sm text-white/70 leading-relaxed">
                  Вывод обрабатывается <strong>вручную администратором</strong> — после отправки жди, пока статус
                  изменится на «Одобрена». Администратор свяжется с тобой для уточнения реквизитов.
                </p>
                <p className="text-xs text-white/40 mt-2">Минимальная сумма вывода — {MIN_WITHDRAW_AMOUNT} ₽.</p>
                <a
                  href={`https://t.me/${TELEGRAM_BOT}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline mt-2"
                >
                  Или обсудить прямо в Telegram-боте <ExternalLink size={12} />
                </a>
              </div>

              {pendingPayouts.length > 0 && (
                <div className="card p-5 border border-accent/20 bg-accent/5">
                  <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Clock size={14} className="text-accent" />
                    Деньги в холде: {pendingPayouts.reduce((sum, p) => sum + p.amount, 0)} ₽
                  </p>
                  <p className="text-xs text-white/40 mb-3">
                    После подтверждения получения покупателем деньги за продажу поступают на баланс не сразу, а через
                    48 часов — это стандартная защита от спорных ситуаций. До зачисления их нельзя ни потратить, ни
                    вывести.
                  </p>
                  <div className="space-y-1.5">
                    {pendingPayouts.map((p) => (
                      <div key={p.orderId} className="flex items-center justify-between text-xs">
                        <span className="text-white/50">Заказ #{p.orderId.slice(0, 8)}</span>
                        <span className="text-white/70">
                          {p.amount} ₽ · поступит {new Date(p.releaseAt).toLocaleString("ru-RU")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="card p-5">
                <form onSubmit={handleWithdraw} className="space-y-4">
                  <div>
                    <label className="text-xs text-white/40 mb-1.5 block">Сумма, ₽ (минимум {MIN_WITHDRAW_AMOUNT} ₽)</label>
                    <input
            autoComplete="off"
                      type="number"
                      min={MIN_WITHDRAW_AMOUNT}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder={`Например, ${MIN_WITHDRAW_AMOUNT}`}
                      className="input-field py-2.5"
                      required
                    />
                    {profile && <p className="text-xs text-white/30 mt-1.5">Доступно для вывода: {profile.balance.toFixed(2)} ₽</p>}
                  </div>

                  <div>
                    <label className="text-xs text-white/40 mb-1.5 block">Удобный способ получения средств</label>
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
            autoComplete="off"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Например, свой ник на Playerok"
                      className="input-field py-2.5"
                    />
                  </div>

                  <button disabled={submittingWithdraw} className="btn-primary w-full py-3 disabled:opacity-50">
                    {submittingWithdraw ? "Создаём заявку..." : "Создать заявку на вывод"}
                  </button>
                </form>
              </div>

              <div>
                <h2 className="text-sm font-medium text-white/60 mb-2">Мои заявки на вывод</h2>
                {loadingRequests ? (
                  <div className="card p-6 text-center text-white/30 text-sm">Загрузка...</div>
                ) : requests.length === 0 ? (
                  <div className="card p-6 text-center text-white/30 text-sm">Заявок пока нет</div>
                ) : (
                  <div className="space-y-2">
                    {requests.map((r) => {
                      const s = TOPUP_STATUS_LABEL[r.status];
                      const StatusIcon = s.icon;
                      return (
                        <div key={r.id} className="card p-3.5 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">Вывод {r.amount} ₽</p>
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
        </>
      )}
    </div>
  );
}

export default function TopUpPage() {
  return (
    <Suspense fallback={<div className="max-w-xl mx-auto py-10 text-center text-white/40">Загрузка...</div>}>
      <TopUpPageInner />
    </Suspense>
  );
}
