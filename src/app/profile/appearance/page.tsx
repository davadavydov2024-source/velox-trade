"use client";

import { Check, Palette } from "lucide-react";
import { useUserTheme, USER_THEME_PRESETS } from "@/lib/userThemeStore";

export default function AppearancePage() {
  const { presetId, setPreset } = useUserTheme();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold mb-1 flex items-center gap-2">
          <Palette size={20} className="text-accent" /> Оформление
        </h1>
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
