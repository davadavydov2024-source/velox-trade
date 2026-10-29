"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MxTheme = "dark" | "light" | "system";
export type BubbleStyle = "tg" | "round" | "flat" | "gradient";

/** Обои чата: рисуются стилями (классы .mx-wp-<id> в messenger.css), картинки хранить не нужно. */
export const WALLPAPERS: { id: string; label: string }[] = [
  { id: "none", label: "Без обоев" },
  { id: "doodle", label: "Узор" },
  { id: "aurora", label: "Аврора" },
  { id: "sunset", label: "Закат" },
  { id: "ocean", label: "Океан" },
  { id: "forest", label: "Лес" },
  { id: "space", label: "Космос" },
  { id: "lavender", label: "Лаванда" },
  { id: "mint", label: "Мята" },
  { id: "graphite", label: "Графит" },
];

export const BUBBLE_STYLES: { id: BubbleStyle; label: string }[] = [
  { id: "tg", label: "Как в Telegram (с хвостиком)" },
  { id: "round", label: "Круглые" },
  { id: "flat", label: "Плоские" },
  { id: "gradient", label: "Градиент и стекло" },
];

interface MxPrefs {
  theme: MxTheme;
  accent: string; // пусто = синий акцент Telegram
  textSize: number; // px, 13–19
  enterToSend: boolean;
  wallpaper: string; // id из WALLPAPERS
  bubbleStyle: BubbleStyle;
  setTheme: (t: MxTheme) => void;
  setAccent: (a: string) => void;
  setTextSize: (n: number) => void;
  setEnterToSend: (v: boolean) => void;
  setWallpaper: (id: string) => void;
  setBubbleStyle: (b: BubbleStyle) => void;
}

export const ACCENT_CHOICES = ["", "#34c759", "#af52de", "#ff2d55", "#00b8d9", "#ffcc00", "#ff9800"];

export const useMxPrefs = create<MxPrefs>()(
  persist(
    (set) => ({
      theme: "dark",
      accent: "",
      textSize: 15,
      enterToSend: true,
      wallpaper: "doodle",
      bubbleStyle: "tg",
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setTextSize: (textSize) => set({ textSize }),
      setEnterToSend: (enterToSend) => set({ enterToSend }),
      setWallpaper: (wallpaper) => set({ wallpaper }),
      setBubbleStyle: (bubbleStyle) => set({ bubbleStyle }),
    }),
    { name: "mx-prefs" }
  )
);
