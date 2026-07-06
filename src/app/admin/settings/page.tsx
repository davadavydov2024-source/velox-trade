"use client";

import { useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { useTheme } from "@/lib/themeContext";
import { useToast } from "@/lib/toastContext";
import { DEFAULT_SITE_SETTINGS } from "@/types";

const PRESET_COLORS = ["#ff9800", "#f44336", "#9c27b0", "#2196f3", "#4caf50", "#e91e63", "#00bcd4"];

export default function AdminSettingsPage() {
  const { settings, applyPreview, save } = useTheme();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [siteName, setSiteName] = useState(settings.siteName);

  async function handleSave() {
    setSaving(true);
    try {
      await save({ ...settings, siteName });
      toast("success", "Настройки сайта сохранены и применены для всех пользователей");
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

  function handleReset() {
    applyPreview(DEFAULT_SITE_SETTINGS);
    setSiteName(DEFAULT_SITE_SETTINGS.siteName);
    toast("info", "Цвета сброшены к значениям по умолчанию (не забудь сохранить)");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Настройки сайта</h1>
        <div className="flex gap-2">
          <button onClick={handleReset} className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-2">
            <RotateCcw size={15} /> Сбросить
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50">
            <Save size={15} /> {saving ? "Сохраняем..." : "Сохранить изменения"}
          </button>
        </div>
      </div>

      <p className="text-xs text-white/40">
        Изменения применяются сразу для предпросмотра. Нажми «Сохранить изменения», чтобы они стали видны всем
        пользователям сайта, а не только тебе в этой вкладке.
      </p>

      <div className="card p-5 space-y-5">
        <div>
          <label className="text-sm font-medium mb-2 block">Название сайта</label>
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} className="input-field py-2.5" />
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Основной цвет (акцент)</label>
          <div className="flex items-center gap-3 mb-3">
            <input
              type="color"
              value={settings.primaryColor}
              onChange={(e) => applyPreview({ primaryColor: e.target.value })}
              className="h-11 w-16 rounded-btn bg-surface border border-border cursor-pointer"
            />
            <input
              value={settings.primaryColor}
              onChange={(e) => applyPreview({ primaryColor: e.target.value })}
              className="input-field py-2.5 font-mono text-sm"
            />
          </div>
          <div className="flex gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => applyPreview({ primaryColor: c })}
                className="w-8 h-8 rounded-full ring-2 ring-offset-2 ring-offset-surface transition-transform hover:scale-110"
                style={{ background: c, borderColor: c === settings.primaryColor ? "#fff" : "transparent" }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Дополнительный оттенок (светлее)</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={settings.secondaryColor}
              onChange={(e) => applyPreview({ secondaryColor: e.target.value })}
              className="h-11 w-16 rounded-btn bg-surface border border-border cursor-pointer"
            />
            <input
              value={settings.secondaryColor}
              onChange={(e) => applyPreview({ secondaryColor: e.target.value })}
              className="input-field py-2.5 font-mono text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Цвет фона</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={settings.bgColor}
              onChange={(e) => applyPreview({ bgColor: e.target.value })}
              className="h-11 w-16 rounded-btn bg-surface border border-border cursor-pointer"
            />
            <input
              value={settings.bgColor}
              onChange={(e) => applyPreview({ bgColor: e.target.value })}
              className="input-field py-2.5 font-mono text-sm"
            />
          </div>
          <p className="text-xs text-white/30 mt-1.5">Рекомендуем оставлять тёмным — сайт спроектирован под тёмную тему.</p>
        </div>
      </div>

      <div className="card p-5">
        <p className="text-sm font-medium mb-3">Предпросмотр</p>
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary px-5 py-2.5">Кнопка действия</button>
          <button className="btn-secondary px-5 py-2.5">Вторичная кнопка</button>
          <span className="px-3 py-2.5 rounded-btn text-sm font-semibold" style={{ background: "var(--color-accent)", color: "#000" }}>
            Акцентный бейдж
          </span>
        </div>
      </div>
    </div>
  );
}
