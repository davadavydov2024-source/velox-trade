"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface UserThemePreset {
  id: string;
  name: string;
  accent: string;
  accentLight: string;
}

// Пресеты цветов, доступные каждому пользователю в личном кабинете — независимо от
// общесайтового цвета, который задаёт администратор в /admin/settings.
export const USER_THEME_PRESETS: UserThemePreset[] = [
  { id: "default", name: "Как на сайте", accent: "", accentLight: "" },
  { id: "orange", name: "Оранжевый", accent: "#ff9800", accentLight: "#ffb74d" },
  { id: "red", name: "Красный", accent: "#f44336", accentLight: "#ff7961" },
  { id: "purple", name: "Фиолетовый", accent: "#9c27b0", accentLight: "#c158dc" },
  { id: "blue", name: "Синий", accent: "#2196f3", accentLight: "#6ec6ff" },
  { id: "green", name: "Зелёный", accent: "#4caf50", accentLight: "#80e27e" },
  { id: "pink", name: "Розовый", accent: "#e91e63", accentLight: "#ff6090" },
  { id: "cyan", name: "Бирюзовый", accent: "#00bcd4", accentLight: "#62efff" },
];

interface UserThemeState {
  presetId: string;
  setPreset: (id: string) => void;
}

export const useUserTheme = create<UserThemeState>()(
  persist(
    (set) => ({
      presetId: "default",
      setPreset: (id) => set({ presetId: id }),
    }),
    { name: "velox-trade-user-theme" }
  )
);
