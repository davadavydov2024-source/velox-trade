"use client";

import { useEffect, useState } from "react";
import { ToggleLeft, ToggleRight, Save, RefreshCw } from "lucide-react";
import { getFeatureFlags, saveFeatureFlags } from "@/lib/featureFlags";
import { forceReloadAllUsers } from "@/lib/users";
import { DEFAULT_FEATURE_FLAGS, FeatureFlags } from "@/types";
import { useToast } from "@/lib/toastContext";

const ROWS: { key: keyof Omit<FeatureFlags, "updatedAt">; label: string; hint: string }[] = [
  { key: "registrationEnabled", label: "Регистрация новых аккаунтов", hint: "Выключи, если хочешь временно закрыть приём новых пользователей" },
  { key: "googleLoginEnabled", label: "Вход через Google", hint: "Кнопка «Войти через Google» на странице входа" },
  { key: "telegramLoginEnabled", label: "Вход по коду в Telegram", hint: "Вкладка «Код в Telegram» на странице входа" },
  { key: "telegramRegisterEnabled", label: "Регистрация через Telegram", hint: "Вкладка «через Telegram» на странице регистрации" },
  { key: "balanceTopupEnabled", label: "Пополнение баланса", hint: "Форма заявки на пополнение/вывод в личном кабинете" },
];

export default function AdminFeaturesPage() {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    getFeatureFlags()
      .then(setFlags)
      .finally(() => setLoading(false));
  }, []);

  function toggle(key: keyof Omit<FeatureFlags, "updatedAt">) {
    setFlags((f) => ({ ...f, [key]: !f[key] }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveFeatureFlags(flags);
      toast("success", "Настройки функций сохранены и применены для всех пользователей");
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на запись. Проверь, что твой UID указан в firestore.rules как админ.");
      } else {
        toast("error", "Не удалось сохранить настройки");
      }
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleForceReloadAll() {
    if (!confirm("Обновить страницу у всех пользователей, у кого сейчас открыт сайт?")) return;
    setReloading(true);
    try {
      await forceReloadAllUsers();
      toast("success", "Команда на обновление отправлена всем открытым вкладкам сайта");
    } catch (err: any) {
      if (err?.code === "permission-denied") {
        toast("error", "Нет прав на запись. Проверь, что твой UID указан в firestore.rules как админ.");
      } else {
        toast("error", "Не удалось отправить команду обновления");
      }
    } finally {
      setReloading(false);
    }
  }

  if (loading) return <div className="card p-10 text-center text-white/40">Загрузка...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Функции сайта</h1>
        <button onClick={handleSave} disabled={saving} className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50">
          <Save size={15} /> {saving ? "Сохраняем..." : "Сохранить"}
        </button>
      </div>
      <p className="text-xs text-white/40">
        Отключение функции скрывает её со стороны пользователей (кнопки/вкладки пропадают) — уже существующие данные
        (аккаунты, привязки и т.д.) не удаляются, функцию можно включить обратно в любой момент.
      </p>

      <div className="card divide-y divide-border">
        {ROWS.map((row) => {
          const enabled = flags[row.key];
          return (
            <div key={row.key} className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-sm">{row.label}</p>
                <p className="text-xs text-white/40">{row.hint}</p>
              </div>
              <button onClick={() => toggle(row.key)} className="shrink-0" aria-label={row.label}>
                {enabled ? (
                  <ToggleRight size={32} className="text-accent" />
                ) : (
                  <ToggleLeft size={32} className="text-white/25" />
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="card p-5">
        <p className="font-medium text-sm mb-1">Комиссия с продажи предметов</p>
        <p className="text-xs text-white/40 mb-3">
          Применяется к заявкам в «Продать предметы»: если пользователь указал цену 100 ₽, а комиссия 20% — ему с
          продажи ≈ 80 ₽, платформе — 20 ₽. Процент фиксируется в момент подачи заявки, так что изменение здесь не
          повлияет на уже поданные заявки — только на новые.
        </p>
        <div className="relative w-40">
          <input
            type="number"
            min={0}
            max={100}
            value={flags.sellCommissionPercent}
            onChange={(e) => setFlags((f) => ({ ...f, sellCommissionPercent: Math.max(0, Math.min(100, Number(e.target.value))) }))}
            className="input-field py-2.5 pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">%</span>
        </div>
      </div>

      <div className="card p-5">
        <p className="font-medium text-sm mb-1">Принудительное обновление сайта у всех</p>
        <p className="text-xs text-white/40 mb-3">
          Полезно после деплоя новой версии — у всех, кто держит сайт открытым в браузере, страница перезагрузится
          автоматически (без ручного Ctrl+F5). Чтобы обновить сайт только одному конкретному пользователю — используй
          кнопку разрыва сессии в разделе «Пользователи».
        </p>
        <button
          onClick={handleForceReloadAll}
          disabled={reloading}
          className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw size={15} /> {reloading ? "Отправляем..." : "Обновить у всех"}
        </button>
      </div>
    </div>
  );
}
