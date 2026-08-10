"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getSiteSettings, saveSiteSettings } from "@/lib/siteSettings";
import { DEFAULT_SITE_SETTINGS, SiteSettings } from "@/types";

interface ThemeContextValue {
  settings: SiteSettings;
  loading: boolean;
  applyPreview: (partial: Partial<SiteSettings>) => void;
  save: (settings: Omit<SiteSettings, "updatedAt">) => Promise<void>;
  applyUserAccent: (accent: string, accentLight: string) => void;
  clearUserAccent: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Затемняет/осветляет hex-цвет на заданный процент (положительный = светлее, отрицательный = темнее).
function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function applyToDocument(settings: SiteSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--color-accent", settings.primaryColor);
  root.style.setProperty("--color-accent-light", settings.secondaryColor || shade(settings.primaryColor, 20));
  root.style.setProperty("--color-accent-dark", shade(settings.primaryColor, -15));
  root.style.setProperty("--color-bg", settings.bgColor);
  root.style.setProperty("--color-surface", shade(settings.bgColor, 6));
  root.style.setProperty("--color-border", shade(settings.bgColor, 12));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SITE_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSiteSettings()
      .then((s) => {
        setSettings(s);
        applyToDocument(s);
      })
      .catch(() => {
        // Настройки темы ещё не сохранялись / Firestore недоступен — остаёмся на цветах по умолчанию
      })
      .finally(() => setLoading(false));
  }, []);

  function applyPreview(partial: Partial<SiteSettings>) {
    const next = { ...settings, ...partial };
    setSettings(next);
    applyToDocument(next);
  }

  async function save(next: Omit<SiteSettings, "updatedAt">) {
    await saveSiteSettings(next);
    const full = { ...next, updatedAt: Date.now() };
    setSettings(full);
    applyToDocument(full);
  }

  // Личный оверрайд цвета для конкретного пользователя (хранится в localStorage на его устройстве),
  // не меняет общесайтовые настройки, которые видят остальные.
  function applyUserAccent(accent: string, accentLight: string) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--color-accent", accent);
    root.style.setProperty("--color-accent-light", accentLight);
    root.style.setProperty("--color-accent-dark", shade(accent, -15));
  }

  function clearUserAccent() {
    applyToDocument(settings);
  }

  return (
    <ThemeContext.Provider value={{ settings, loading, applyPreview, save, applyUserAccent, clearUserAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme должен использоваться внутри <ThemeProvider>");
  return ctx;
}
