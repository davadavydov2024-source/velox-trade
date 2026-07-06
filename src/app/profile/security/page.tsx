"use client";

import { useEffect, useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { Send, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { createTelegramLinkRequest, getTelegramLink, TelegramLink } from "@/lib/telegramLink";

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
  const { user, profile, resetPassword } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const [telegramLink, setTelegramLink] = useState<TelegramLink | null>(null);
  const [checkingLink, setCheckingLink] = useState(true);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (!user) return;
    refreshTelegramStatus();
  }, [user]);

  async function refreshTelegramStatus() {
    if (!user) return;
    setCheckingLink(true);
    try {
      setTelegramLink(await getTelegramLink(user.uid));
    } catch {
      // тихо игнорируем — просто покажем состояние "не привязан"
    } finally {
      setCheckingLink(false);
    }
  }

  async function handleGenerateLink() {
    if (!user) return;
    setGeneratingLink(true);
    try {
      const code = await createTelegramLinkRequest(user.uid);
      setLinkUrl(`https://t.me/${TELEGRAM_BOT}?start=${code}`);
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет доступа к базе данных. Проверь, что правила Firestore опубликованы.");
      } else {
        toast("error", "Не удалось создать ссылку для привязки");
      }
    } finally {
      setGeneratingLink(false);
    }
  }

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

  async function handleResetPassword() {
    if (!profile) return;
    try {
      await resetPassword(profile.email);
      toast("success", "Письмо для смены пароля отправлено на ваш email");
    } catch (err: any) {
      toast("error", err?.message || "Не удалось отправить письмо. Проверь настройки EmailJS на сервере.");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold mb-2">Безопасность</h1>

      <div className="card p-5 flex items-center justify-between">
        <div>
          <p className="font-medium">Подтверждение email</p>
          <p className="text-sm text-white/40">{profile?.emailVerified ? "Email подтверждён" : "Email не подтверждён"}</p>
        </div>
        {!profile?.emailVerified && (
          <button onClick={resendVerification} disabled={sending || cooldown > 0} className="btn-secondary px-4 py-2 text-sm disabled:opacity-50">
            {sending ? "Отправка..." : cooldown > 0 ? `Повтор через ${cooldown}с` : "Отправить письмо"}
          </button>
        )}
      </div>

      <div className="card p-5 flex items-center justify-between">
        <div>
          <p className="font-medium">Пароль</p>
          <p className="text-sm text-white/40">Сменить пароль через письмо на email</p>
        </div>
        <button onClick={handleResetPassword} className="btn-secondary px-4 py-2 text-sm">
          Сменить пароль
        </button>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="font-medium">Вход по коду в Telegram</p>
          {!checkingLink && (
            <button onClick={refreshTelegramStatus} className="text-white/30 hover:text-white/60" title="Обновить статус">
              <RefreshCw size={14} />
            </button>
          )}
        </div>
        <p className="text-sm text-white/40 mb-3">
          Привяжи Telegram — тогда сможешь входить на новых устройствах по коду, который придёт тебе в бота, без
          пароля.
        </p>

        {checkingLink ? (
          <p className="text-xs text-white/30">Проверяем статус...</p>
        ) : telegramLink ? (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle2 size={16} />
            Привязан{telegramLink.telegramUsername ? ` (@${telegramLink.telegramUsername})` : ""}
          </div>
        ) : linkUrl ? (
          <div className="space-y-2">
            <a
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary px-5 py-2.5 text-sm inline-flex items-center gap-2"
            >
              Открыть Telegram-бота <ExternalLink size={14} />
            </a>
            <p className="text-xs text-white/30">
              Нажми «Start» в боте — привязка произойдёт автоматически, затем нажми «Обновить статус» выше.
            </p>
          </div>
        ) : (
          <button onClick={handleGenerateLink} disabled={generatingLink} className="btn-secondary px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
            <Send size={14} /> {generatingLink ? "Создаём ссылку..." : "Привязать Telegram"}
          </button>
        )}
      </div>
    </div>
  );
}
