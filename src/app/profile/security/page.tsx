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
  const { user, profile, resetPassword } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

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
    </div>
  );
}
