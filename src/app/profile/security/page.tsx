"use client";

import { useEffect, useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";

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
