"use client";

import { useState } from "react";
import { Check, Palette, Globe } from "lucide-react";
import { useUserTheme, USER_THEME_PRESETS } from "@/lib/userThemeStore";
import { useLanguage } from "@/lib/languageStore";
import { LANGUAGES } from "@/lib/i18n";
import { useAuth } from "@/lib/authContext";
import { setUserLanguage } from "@/lib/users";
import { useToast } from "@/lib/toastContext";

export default function AppearancePage() {
  const { presetId, setPreset } = useUserTheme();
  const { language, setLanguage, t } = useLanguage();
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [savingLang, setSavingLang] = useState(false);

  async function handleSetLanguage(code: "ru" | "en" | "zh") {
    setLanguage(code);
    if (!user) return;
    setSavingLang(true);
    try {
      await setUserLanguage(user.uid, code);
      await refreshProfile();
    } catch {
      // не критично — язык всё равно уже переключился локально в этом браузере
    } finally {
      setSavingLang(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold mb-1 flex items-center gap-2">
          <Globe size={20} className="text-accent" /> {t("auth_language_label")}
        </h1>
        <p className="text-sm text-white/40">
          Выбери язык интерфейса. Он сохранится в твоём аккаунте и подтянется при входе с другого устройства.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {LANGUAGES.map((l) => {
          const active = language === l.code;
          return (
            <button
              key={l.code}
              onClick={() => handleSetLanguage(l.code)}
              disabled={savingLang}
              className={`card p-4 flex items-center justify-center gap-2.5 border transition-all disabled:opacity-50 ${
                active ? "border-accent" : "border-transparent hover:border-white/10"
              }`}
            >
              <span className="text-xl">{l.flag}</span>
              <span className="text-sm text-white/80">{l.label}</span>
              {active && <Check size={16} className="text-accent" />}
            </button>
          );
        })}
      </div>

      <div>
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <Palette size={20} className="text-accent" /> Оформление
        </h2>
        <p className="text-sm text-white/40">
          Выбери акцентный цвет для себя — изменится только в твоём браузере, для остальных пользователей сайт
          останется таким, каким его настроил администратор.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {USER_THEME_PRESETS.map((preset) => {
          const active = presetId === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => setPreset(preset.id)}
              className={`card p-4 flex flex-col items-center gap-2.5 border transition-all ${
                active ? "border-accent" : "border-transparent hover:border-white/10"
              }`}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: preset.id === "default" ? "var(--color-accent)" : preset.accent,
                }}
              >
                {active && <Check size={18} className="text-black" />}
              </div>
              <span className="text-xs text-white/70">{preset.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

