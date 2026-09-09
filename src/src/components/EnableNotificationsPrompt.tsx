"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { isPushSupported, hasActiveSubscription, subscribeToPush } from "@/lib/webPush";

const DISMISS_KEY = "vt_push_prompt_dismissed";

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (window.navigator as any).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

export function EnableNotificationsPrompt() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (!isPushSupported()) return;
    // На iOS push вообще недоступен, пока сайт не добавлен на главный экран (открыт как
    // обычная вкладка Safari) — предлагать включить уведомления в этом случае бессмысленно.
    if (isIos() && !isStandalone()) return;
    if (typeof Notification !== "undefined" && Notification.permission !== "default") return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    let cancelled = false;
    hasActiveSubscription(user.uid).then((already) => {
      if (!cancelled && !already) {
        // Небольшая задержка — чтобы не выскакивало одновременно с маскотом/тостами сразу при заходе.
        setTimeout(() => !cancelled && setVisible(true), 1500);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!visible || !user) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  async function handleEnable() {
    if (!user) return;
    setBusy(true);
    try {
      await subscribeToPush(user.uid);
      toast("success", "Уведомления включены!");
      setVisible(false);
    } catch (err: any) {
      if (err?.message !== "permission-denied") {
        toast("error", "Не удалось включить уведомления");
      }
      dismiss();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed left-4 right-4 sm:left-auto sm:right-6 bottom-20 lg:bottom-6 z-[95] sm:max-w-xs">
      <div className="card p-4 shadow-glow flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center flex-none">
          <Bell size={17} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold mb-0.5">Включить уведомления?</p>
          <p className="text-xs text-white/50 mb-3">Узнавай о новых сообщениях и статусе заказов сразу</p>
          <div className="flex gap-2">
            <button onClick={handleEnable} disabled={busy} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50">
              {busy ? "..." : "Включить"}
            </button>
            <button onClick={dismiss} className="btn-secondary px-3 py-1.5 text-xs">
              Не сейчас
            </button>
          </div>
        </div>
        <button onClick={dismiss} className="text-white/30 hover:text-white/60 flex-none" aria-label="Закрыть">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
