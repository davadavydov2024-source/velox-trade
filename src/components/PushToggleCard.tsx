"use client";

import { useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Bell, BellOff, ShoppingBag, MessageSquare, Clock, Megaphone } from "lucide-react";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/lib/toastContext";
import { isPushSupported, hasActiveSubscription, subscribeToPush, unsubscribeFromPush } from "@/lib/webPush";
import { PushCategories, DEFAULT_PUSH_CATEGORIES } from "@/types";

const CATEGORY_LIST: { key: keyof PushCategories; label: string; hint: string; icon: typeof ShoppingBag }[] = [
  { key: "purchases", label: "Покупки", hint: "Купили ваш товар, выигрыш на колесе фортуны", icon: ShoppingBag },
  { key: "messages", label: "Сообщения", hint: "Чат по заказу, ответы поддержки", icon: MessageSquare },
  { key: "reminders", label: "Напоминания", hint: "Забытая корзина, окончание буста товара", icon: Clock },
  { key: "news", label: "Новости", hint: "Объявления и рассылки от администрации", icon: Megaphone },
];

function Switch({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-40 ${on ? "bg-accent" : "bg-white/15"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

export function PushToggleCard() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [categoryBusy, setCategoryBusy] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const categories: PushCategories = profile?.pushCategories ?? DEFAULT_PUSH_CATEGORIES;

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
        toast("error", "Push ещё не настроен на сервере (нет NEXT_PUBLIC_FCM_VAPID_KEY)");
      } else if (err?.message === "token-failed") {
        toast("error", "Не удалось получить токен уведомлений — проверь VAPID-ключ и перезагрузи страницу");
      } else {
        toast("error", "Не удалось изменить настройку уведомлений");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/push/test", { method: "POST", headers: { Authorization: `Bearer ${idToken}` } });
      const data = await res.json();
      if (!res.ok) {
        toast("error", `Сервер не смог отправить: ${data.detail || data.error}`);
      } else if (data.devices === 0) {
        toast("warning", "На сервере нет подписки для этого аккаунта — выключи и снова включи уведомления");
      } else if (data.sent > 0) {
        toast("success", `Отправлено на устройств: ${data.sent}. Уведомление должно прийти через пару секунд`);
      } else {
        toast("error", `Не доставлено: ${data.errors?.[0] ?? "неизвестная ошибка"}`);
      }
    } catch {
      toast("error", "Не удалось отправить тест");
    } finally {
      setTesting(false);
    }
  }

  async function handleCategoryToggle(key: keyof PushCategories) {
    if (!user) return;
    setCategoryBusy(key);
    const next = { ...categories, [key]: !categories[key] };
    try {
      await updateDoc(doc(db, "users", user.uid), { pushCategories: next });
      await refreshProfile();
    } catch {
      toast("error", "Не удалось сохранить настройку");
    } finally {
      setCategoryBusy(null);
    }
  }

  if (!supported) return null;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {enabled ? <Bell size={18} className="text-accent" /> : <BellOff size={18} className="text-white/40" />}
          <div>
            <p className="font-medium">Push-уведомления в браузере</p>
            <p className="text-sm text-white/40">Новые сообщения и заказы — даже если сайт не открыт</p>
          </div>
        </div>
        <Switch on={enabled} onClick={handleToggle} disabled={loading || busy} />
      </div>

      {enabled && (
        <button type="button" onClick={handleTest} disabled={testing} className="btn-secondary w-full py-2 text-sm disabled:opacity-50">
          {testing ? "Отправляем..." : "Отправить тестовое уведомление"}
        </button>
      )}

      {enabled && (
        <div className="pt-3 border-t border-white/10 space-y-3">
          <p className="text-xs text-white/40">Что присылать</p>
          {CATEGORY_LIST.map(({ key, label, hint, icon: Icon }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Icon size={15} className="text-white/40 shrink-0" />
                <div>
                  <p className="text-sm">{label}</p>
                  <p className="text-xs text-white/35">{hint}</p>
                </div>
              </div>
              <Switch on={categories[key] !== false} onClick={() => handleCategoryToggle(key)} disabled={categoryBusy === key} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
