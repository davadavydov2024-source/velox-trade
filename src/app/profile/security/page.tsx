"use client";

import { useEffect, useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { createTelegramLinkRequest, getTelegramLink, unlinkTelegram, TelegramLink } from "@/lib/telegramLink";
import {
  listSessions,
  getCurrentSession,
  terminateSession,
  canManageSessions,
  msUntilCanManage,
  getDeviceId,
} from "@/lib/sessions";
import { UserSession } from "@/types";
import { Monitor, ShieldCheck } from "lucide-react";

const TELEGRAM_BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT || "veloxtrade_robot";

function translateAuthError(code?: string) {
  switch (code) {
    case "auth/too-many-requests":
      return "Письмо уже отправлялось недавно. Firebase ограничивает частоту повторной отправки — подожди минуту и попробуй снова (письмо могло прийти раньше, проверь папку «Спам»).";
    case "auth/user-token-expired":
    case "auth/requires-recent-login":
      return "Сессия устарела. Выйди и войди в аккаунт заново, затем повтори попытку.";
    case "auth/network-request-failed":
      return "Проблема с сетью. Проверь подключение к интернету.";
    default:
      return "Не удалось отправить письмо. Попробуй ещё раз через минуту.";
  }
}

export default function SecurityPage() {
  const { user, profile, resetPassword, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [tgLink, setTgLink] = useState<TelegramLink | null>(null);
  const [tgLoading, setTgLoading] = useState(true);
  const [tgConnecting, setTgConnecting] = useState(false);
  const [tgUnlinking, setTgUnlinking] = useState(false);

  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [currentSession, setCurrentSession] = useState<UserSession | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const deviceId = getDeviceId();

  useEffect(() => {
    if (!user) return;
    getTelegramLink(user.uid)
      .then(setTgLink)
      .finally(() => setTgLoading(false));
  }, [user]);

  async function loadSessions() {
    if (!user) return;
    setSessionsLoading(true);
    try {
      const [list, current] = await Promise.all([listSessions(user.uid), getCurrentSession(user.uid)]);
      setSessions(list);
      setCurrentSession(current);
    } finally {
      setSessionsLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const canManage = canManageSessions(currentSession);
  const hoursLeft = Math.ceil(msUntilCanManage(currentSession) / (60 * 60 * 1000));

  async function handleTerminate(targetDeviceId: string) {
    if (!confirm("Завершить эту сессию? Устройство будет разлогинено немедленно.")) return;
    setTerminatingId(targetDeviceId);
    try {
      await terminateSession(targetDeviceId);
      toast("success", "Сессия завершена");
      await loadSessions();
    } catch (err: any) {
      toast("error", err?.message || "Не удалось завершить сессию");
    } finally {
      setTerminatingId(null);
    }
  }

  async function handleTerminateAll() {
    if (!confirm("Завершить все остальные сессии, кроме этого устройства?")) return;
    setTerminatingId("all");
    try {
      await terminateSession("all");
      toast("success", "Остальные сессии завершены");
      await loadSessions();
    } catch (err: any) {
      toast("error", err?.message || "Не удалось завершить сессии");
    } finally {
      setTerminatingId(null);
    }
  }

  async function handleConnectTelegram() {
    if (!user) return;
    setTgConnecting(true);
    try {
      const code = await createTelegramLinkRequest(user.uid);
      window.open(`https://t.me/${TELEGRAM_BOT}?start=${code}`, "_blank");
      toast("success", "Открылся Telegram — нажми Start в боте, затем вернись сюда и нажми «Проверить».");
    } catch {
      toast("error", "Не удалось создать код привязки. Попробуй ещё раз.");
    } finally {
      setTgConnecting(false);
    }
  }

  async function handleCheckTelegram() {
    if (!user) return;
    setTgLoading(true);
    try {
      const link = await getTelegramLink(user.uid);
      setTgLink(link);
      toast(link ? "success" : "warning", link ? "Telegram привязан!" : "Пока не привязан — сначала нажми Start в боте по открывшейся ссылке.");
    } finally {
      setTgLoading(false);
    }
  }

  async function handleUnlinkTelegram() {
    if (!confirm("Отвязать Telegram? Уведомления и рассылки перестанут приходить туда.")) return;
    setTgUnlinking(true);
    try {
      await unlinkTelegram();
      setTgLink(null);
      toast("success", "Telegram отвязан");
    } catch {
      toast("error", "Не удалось отвязать Telegram");
    } finally {
      setTgUnlinking(false);
    }
  }

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resendVerification() {
    if (!user || cooldown > 0) return;
    setSending(true);
    try {
      await sendEmailVerification(user);
      toast("success", "Письмо отправлено повторно. Проверь почту (и папку «Спам»).");
      setCooldown(60);
    } catch (err: any) {
      toast("error", translateAuthError(err?.code));
      if (err?.code === "auth/too-many-requests") setCooldown(60);
    } finally {
      setSending(false);
    }
  }

  async function checkVerification() {
    setChecking(true);
    try {
      const updated = await refreshProfile();
      toast(updated?.emailVerified ? "success" : "warning", updated?.emailVerified ? "Email подтверждён!" : "Пока не подтверждён — перейди по ссылке из письма и попробуй снова.");
    } finally {
      setChecking(false);
    }
  }

  async function handleResetPassword() {
    if (!profile) return;
    setResettingPassword(true);
    try {
      await resetPassword(profile.email);
      toast("success", "Письмо для смены пароля отправлено на ваш email");
    } catch (err: any) {
      console.error("Сброс пароля не удался:", err);
      const status = err?.status;
      if (status === 403 || status === 401) {
        toast("error", "EmailJS отклонил запрос (403/401). Проверь Public Key и разрешённые домены (Allowed origins) в настройках EmailJS.");
      } else if (status === 400) {
        toast("error", "EmailJS вернул ошибку 400 — вероятно, не совпадают названия переменных в шаблоне сброса пароля.");
      } else {
        toast("error", err?.message || err?.text || "Не удалось отправить письмо. Попробуй ещё раз через минуту.");
      }
    } finally {
      setResettingPassword(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold mb-2">Безопасность</h1>

      <div className="card p-5 flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">Подтверждение email</p>
          <p className="text-sm text-white/40">{profile?.emailVerified ? "Email подтверждён" : "Email не подтверждён"}</p>
        </div>
        {!profile?.emailVerified && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={checkVerification} disabled={checking} className="text-xs text-white/40 hover:text-white/70 underline underline-offset-2 disabled:opacity-50">
              {checking ? "Проверяем..." : "Я подтвердил — проверить"}
            </button>
            <button onClick={resendVerification} disabled={sending || cooldown > 0} className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">
              {sending ? "Отправка..." : cooldown > 0 ? `Повтор через ${cooldown}с` : "Отправить письмо"}
            </button>
          </div>
        )}
      </div>

      <div className="card p-5 flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">Telegram</p>
          <p className="text-sm text-white/40">
            {tgLoading
              ? "Проверяем..."
              : tgLink
              ? `Привязан${tgLink.telegramUsername ? ` — @${tgLink.telegramUsername}` : ""}`
              : "Не привязан — уведомления о заказах, заявках и рассылки будут приходить в Telegram"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tgLink ? (
            <button onClick={handleUnlinkTelegram} disabled={tgUnlinking} className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">
              {tgUnlinking ? "..." : "Отвязать"}
            </button>
          ) : (
            <>
              <button onClick={handleCheckTelegram} disabled={tgLoading} className="text-xs text-white/40 hover:text-white/70 underline underline-offset-2 disabled:opacity-50">
                Проверить
              </button>
              <button onClick={handleConnectTelegram} disabled={tgConnecting} className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">
                {tgConnecting ? "..." : "Подключить Telegram"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">Активные сессии</p>
            <p className="text-sm text-white/40">Устройства, на которых выполнен вход в аккаунт</p>
          </div>
          {sessions.length > 1 && (
            <button
              onClick={handleTerminateAll}
              disabled={!canManage || terminatingId !== null}
              className="btn-secondary px-4 py-2 text-sm disabled:opacity-50 shrink-0"
              title={!canManage ? `Доступно через ${hoursLeft} ч.` : undefined}
            >
              {terminatingId === "all" ? "..." : "Завершить остальные"}
            </button>
          )}
        </div>

        {!canManage && !sessionsLoading && (
          <div className="flex items-start gap-2 text-xs text-white/40 bg-white/5 rounded-lg p-3">
            <ShieldCheck size={16} className="shrink-0 mt-0.5" />
            <span>
              Завершать другие сессии с этого устройства можно будет через {hoursLeft} ч. — это защита на случай,
              если аккаунт угнали: у злоумышленника есть доступ, но не будет возможности выкинуть тебя из твоих же
              сессий.
            </span>
          </div>
        )}

        {sessionsLoading ? (
          <p className="text-sm text-white/40">Загрузка...</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const isCurrent = s.deviceId === deviceId;
              return (
                <div key={s.deviceId} className="flex items-center justify-between gap-3 bg-white/5 rounded-lg p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Monitor size={18} className="text-white/40 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {s.deviceLabel} {isCurrent && <span className="text-emerald-400">— это устройство</span>}
                      </p>
                      <p className="text-xs text-white/40">
                        Первый вход: {new Date(s.createdAt).toLocaleString("ru-RU")} · Активность:{" "}
                        {new Date(s.lastActiveAt).toLocaleString("ru-RU")}
                      </p>
                    </div>
                  </div>
                  {!isCurrent && (
                    <button
                      onClick={() => handleTerminate(s.deviceId)}
                      disabled={!canManage || terminatingId !== null}
                      className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2 disabled:opacity-40 disabled:no-underline shrink-0"
                      title={!canManage ? `Доступно через ${hoursLeft} ч.` : undefined}
                    >
                      {terminatingId === s.deviceId ? "..." : "Завершить"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card p-5 flex items-center justify-between">
        <div>
          <p className="font-medium">Пароль</p>
          <p className="text-sm text-white/40">Сменить пароль через письмо на email</p>
        </div>
        <button onClick={handleResetPassword} disabled={resettingPassword} className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">
          {resettingPassword ? "Отправка..." : "Сменить пароль"}
        </button>
      </div>
    </div>
  );
}
