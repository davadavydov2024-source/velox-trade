"use client";

import { Suspense, useEffect, useState } from "react";
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
import { createTopUpRequest, getUserTopUpRequests } from "@/lib/users";
import { createCactusPayment, getUserPayments, watchPayment, cancelPayment, sweepExpiredPayments } from "@/lib/payments";
import { getFeatureFlags } from "@/lib/featureFlags";
import { TopUpRequest, Payment } from "@/types";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/languageStore";
import { tf } from "@/lib/i18n";

const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT || "veloxtrade_robot";

const QUICK_AMOUNTS = [100, 300, 500, 1000, 2000, 5000];

const METHOD_OPTIONS: { value: TopUpRequest["method"]; labelKey: string; icon: typeof QrCode }[] = [
  { value: "qr", labelKey: "topup_method_qr", icon: QrCode },
  { value: "playerok", labelKey: "topup_method_playerok", icon: ExternalLink },
  { value: "funpay", labelKey: "topup_method_funpay", icon: ExternalLink },
  { value: "phone", labelKey: "topup_method_phone", icon: Smartphone },
];

const TOPUP_STATUS_META: Record<TopUpRequest["status"], { key: string; color: string; icon: typeof Clock }> = {
  pending: { key: "topup_status_pending", color: "#ff9800", icon: Clock },
  approved: { key: "topup_status_approved", color: "#4caf50", icon: CheckCircle2 },
  rejected: { key: "topup_status_rejected", color: "#f44336", icon: XCircle },
};

const PAYMENT_STATUS_META: Record<Payment["status"], { key: string; color: string; icon: typeof Clock }> = {
  pending: { key: "payment_status_pending", color: "#ff9800", icon: Clock },
  paid: { key: "payment_status_paid", color: "#4caf50", icon: CheckCircle2 },
  failed: { key: "payment_status_failed", color: "#f44336", icon: XCircle },
  cancelled: { key: "payment_status_cancelled", color: "#9aa3b2", icon: XCircle },
};

function TopUpPageInner() {
  const { t, language } = useLanguage();
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [enabled, setEnabled] = useState(true);
  const [flagsLoaded, setFlagsLoaded] = useState(false);

  const [depositAmount, setDepositAmount] = useState("");
  const [payingNow, setPayingNow] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [method, setMethod] = useState<TopUpRequest["method"]>("qr");
  const [comment, setComment] = useState("");
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);
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
    refreshPayments();
    refreshRequests();
  }, [user]);

  useEffect(() => {
    const orderId = searchParams.get("order_id");
    if (!orderId) return;
    setPendingOrderId(orderId);
    const unsub = watchPayment(orderId, (payment) => {
      if (payment?.status === "paid") {
        toast("success", tf(language, "topup_balance_topped_up", { amount: payment.amount }));
        refreshProfile();
        refreshPayments();
        setPendingOrderId(null);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
    if (!num || num < 100) {
      toast("warning", t("topup_toast_min_amount"));
      return;
    }
    setPayingNow(true);
    try {
      const { url } = await createCactusPayment(num);
      window.location.href = url;
    } catch (err: any) {
      toast("error", err?.message || t("topup_toast_pay_failed"));
      setPayingNow(false);
    }
  }

  async function handleCancelPayment(orderId: string) {
    setCancellingId(orderId);
    try {
      await cancelPayment(orderId);
      toast("success", t("topup_toast_cancelled"));
      if (pendingOrderId === orderId) setPendingOrderId(null);
      refreshPayments();
    } catch (err: any) {
      toast("error", err?.message || t("topup_toast_cancel_failed"));
      refreshPayments(); // на случай, если сервер уже зачислил баланс (оплата пришла раньше отмены)
      refreshProfile();
    } finally {
      setCancellingId(null);
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile) return;
    const num = Number(withdrawAmount);
    if (!num || num <= 0) {
      toast("warning", t("topup_toast_bad_amount"));
      return;
    }
    if (num > profile.balance) {
      toast("error", t("topup_toast_over_balance"));
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
      toast("success", t("topup_toast_withdraw_sent"));
      setWithdrawAmount("");
      setComment("");
      refreshRequests();
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", t("topup_toast_no_permission"));
      } else {
        toast("error", t("topup_toast_withdraw_failed"));
      }
      console.error(err);
    } finally {
      setSubmittingWithdraw(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-xl font-bold">{t("topup_title")}</h1>

      {!flagsLoaded ? (
        <div className="card p-10 text-center text-white/40">{t("common_loading")}</div>
      ) : !enabled ? (
        <div className="card p-8 text-center">
          <p className="text-white/60">{t("topup_disabled")}</p>
          <p className="text-white/40 text-sm mt-2">
            {t("topup_need_help")}{" "}
            <a href="/chats?tab=support" className="text-accent hover:underline">
              {t("topup_support_link")}
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
              <ArrowDownCircle size={16} /> {t("topup_tab_deposit")}
            </button>
            <button
              type="button"
              onClick={() => setTab("withdraw")}
              className={`flex-1 py-2.5 rounded-btn text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                tab === "withdraw" ? "bg-accent text-black" : "bg-surface text-white/60"
              }`}
            >
              <ArrowUpCircle size={16} /> {t("topup_tab_withdraw")}
            </button>
          </div>

          {tab === "deposit" ? (
            <>
              <div className="card p-5 border border-yellow-500/20 bg-yellow-500/5">
                <p className="text-sm text-white/70 leading-relaxed">{t("topup_deposit_notice")}</p>
              </div>

              {pendingOrderId && (
                <div className="card p-4 border border-accent/30 bg-accent/5 flex items-center gap-3">
                  <Clock size={18} className="text-accent shrink-0 animate-pulse" />
                  <p className="text-sm text-white/70">{t("topup_waiting_confirmation")}</p>
                </div>
              )}

              <div className="card p-5">
                <form onSubmit={handlePay} className="space-y-4">
                  <div>
                    <label className="text-xs text-white/40 mb-1.5 block">{t("topup_amount_label")}</label>
                    <input
                      type="number"
                      min={100}
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder={t("topup_amount_placeholder")}
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
                    <CreditCard size={16} /> {payingNow ? t("topup_pay_redirecting") : t("topup_pay_button")}
                  </button>
                </form>
              </div>

              <div>
                <h2 className="text-sm font-medium text-white/60 mb-2">{t("topup_history_title")}</h2>
                {loadingPayments ? (
                  <div className="card p-6 text-center text-white/30 text-sm">{t("common_loading")}</div>
                ) : payments.length === 0 ? (
                  <div className="card p-6 text-center text-white/30 text-sm">{t("topup_no_payments")}</div>
                ) : (
                  <div className="space-y-2">
                    {payments.map((p) => {
                      const meta = PAYMENT_STATUS_META[p.status];
                      const StatusIcon = meta.icon;
                      return (
                        <div key={p.id} className="card p-3.5 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{p.amount} ₽</p>
                            <p className="text-xs text-white/30">{new Date(p.createdAt).toLocaleString("ru-RU")}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: meta.color }}>
                              <StatusIcon size={14} /> {t(meta.key)}
                            </span>
                            {p.status === "pending" && (
                              <button
                                onClick={() => handleCancelPayment(p.id)}
                                disabled={cancellingId === p.id}
                                className="text-xs text-white/40 hover:text-red-400 underline underline-offset-2 disabled:opacity-50"
                              >
                                {cancellingId === p.id ? t("topup_cancelling") : t("topup_cancel")}
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
                <p className="text-sm text-white/70 leading-relaxed">{t("topup_withdraw_notice")}</p>
                <a
                  href={`https://t.me/${TELEGRAM_BOT}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline mt-2"
                >
                  {t("topup_withdraw_telegram")} <ExternalLink size={12} />
                </a>
              </div>

              <div className="card p-5">
                <form onSubmit={handleWithdraw} className="space-y-4">
                  <div>
                    <label className="text-xs text-white/40 mb-1.5 block">{t("topup_withdraw_amount_label")}</label>
                    <input
                      type="number"
                      min={1}
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder={t("topup_amount_placeholder")}
                      className="input-field py-2.5"
                      required
                    />
                    {profile && <p className="text-xs text-white/30 mt-1.5">{tf(language, "topup_withdraw_available", { balance: profile.balance.toFixed(2) })}</p>}
                  </div>

                  <div>
                    <label className="text-xs text-white/40 mb-1.5 block">{t("topup_withdraw_method_label")}</label>
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
                            <Icon size={14} /> {t(m.labelKey)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-white/40 mb-1.5 block">{t("topup_withdraw_comment_label")}</label>
                    <input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={t("topup_withdraw_comment_placeholder")}
                      className="input-field py-2.5"
                    />
                  </div>

                  <button disabled={submittingWithdraw} className="btn-primary w-full py-3 disabled:opacity-50">
                    {submittingWithdraw ? t("topup_withdraw_submitting") : t("topup_withdraw_submit")}
                  </button>
                </form>
              </div>

              <div>
                <h2 className="text-sm font-medium text-white/60 mb-2">{t("topup_my_requests_title")}</h2>
                {loadingRequests ? (
                  <div className="card p-6 text-center text-white/30 text-sm">{t("common_loading")}</div>
                ) : requests.length === 0 ? (
                  <div className="card p-6 text-center text-white/30 text-sm">{t("topup_no_requests")}</div>
                ) : (
                  <div className="space-y-2">
                    {requests.map((r) => {
                      const meta = TOPUP_STATUS_META[r.status];
                      const StatusIcon = meta.icon;
                      return (
                        <div key={r.id} className="card p-3.5 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{tf(language, "topup_withdraw_line", { amount: r.amount })}</p>
                            <p className="text-xs text-white/30">{new Date(r.createdAt).toLocaleString("ru-RU")}</p>
                          </div>
                          <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: meta.color }}>
                            <StatusIcon size={14} /> {t(meta.key)}
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
    <Suspense fallback={<div className="max-w-xl mx-auto py-10 text-center text-white/40">…</div>}>
      <TopUpPageInner />
    </Suspense>
  );
}
