"use client";

import { useEffect } from "react";
import { useTheme } from "@/lib/themeContext";
import { useUserTheme, USER_THEME_PRESETS } from "@/lib/userThemeStore";

export function UserThemeSync() {
  const { loading, applyUserAccent, clearUserAccent } = useTheme();
  const presetId = useUserTheme((s) => s.presetId);

  useEffect(() => {
    if (loading) return; // ждём, пока подгрузятся общесайтовые цвета, иначе оверрайд перезатрётся
    if (presetId === "default") {
      clearUserAccent();
      return;
    }
    const preset = USER_THEME_PRESETS.find((p) => p.id === presetId);
    if (preset) applyUserAccent(preset.accent, preset.accentLight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, loading]);

  return null;
}
