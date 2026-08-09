"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { isPushSupported, hasActiveSubscription, subscribeToPush, unsubscribeFromPush } from "@/lib/webPush";

export function PushToggleCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!isPushSupported()) {
      setSupported(false);
      setLoading(false);
      return;
    }
    hasActiveSubscription(user.uid)
      .then(setEnabled)
      .finally(() => setLoading(false));
  }, [user]);

  async function handleToggle() {
    if (!user) return;
    setBusy(true);
    try {
      if (enabled) {
        await unsubscribeFromPush(user.uid);
        setEnabled(false);
        toast("success", "Push-уведомления выключены");
      } else {
        await subscribeToPush(user.uid);
        setEnabled(true);
        toast("success", "Push-уведомления включены");
      }
    } catch (err: any) {
      if (err?.message === "permission-denied") {
        toast("warning", "Разрешение на уведомления не дано — включи его в настройках браузера для этого сайта");
      } else if (err?.message === "vapid-not-configured") {
        toast("error", "Push ещё не настроен на сервере");
      } else {
        toast("error", "Не удалось изменить настройку уведомлений");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <div className="card p-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {enabled ? <Bell size={18} className="text-accent" /> : <BellOff size={18} className="text-white/40" />}
        <div>
          <p className="font-medium">Push-уведомления в браузере</p>
          <p className="text-sm text-white/40">Новые сообщения и заказы — даже если сайт не открыт</p>
        </div>
      </div>
      <button
        onClick={handleToggle}
        disabled={loading || busy}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${enabled ? "bg-accent" : "bg-white/15"}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
