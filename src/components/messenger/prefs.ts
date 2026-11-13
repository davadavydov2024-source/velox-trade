"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MxTheme = "dark" | "light" | "system";

/** Шрифты мессенджера: системные работают сразу, остальные подгружаются с Google Fonts при выборе (все с кириллицей). */
export const FONT_CHOICES: { id: string; label: string; css: string; google?: string }[] = [
  { id: "", label: "По умолчанию", css: "" },
  { id: "system", label: "Системный", css: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  { id: "roboto", label: "Roboto", css: '"Roboto", sans-serif', google: "Roboto:wght@400;500;700" },
  { id: "inter", label: "Inter", css: '"Inter", sans-serif', google: "Inter:wght@400;500;700" },
  { id: "nunito", label: "Nunito", css: '"Nunito", sans-serif', google: "Nunito:wght@400;600;800" },
  { id: "montserrat", label: "Montserrat", css: '"Montserrat", sans-serif', google: "Montserrat:wght@400;500;700" },
  { id: "ptsans", label: "PT Sans", css: '"PT Sans", sans-serif', google: "PT+Sans:wght@400;700" },
  { id: "manrope", label: "Manrope", css: '"Manrope", sans-serif', google: "Manrope:wght@400;500;700" },
  { id: "rubik", label: "Rubik", css: '"Rubik", sans-serif', google: "Rubik:wght@400;500;700" },
  { id: "comfortaa", label: "Comfortaa", css: '"Comfortaa", sans-serif', google: "Comfortaa:wght@400;600;700" },
  { id: "lora", label: "Lora (с засечками)", css: '"Lora", Georgia, serif', google: "Lora:wght@400;500;700" },
  { id: "ptserif", label: "PT Serif", css: '"PT Serif", Georgia, serif', google: "PT+Serif:wght@400;700" },
  { id: "mono", label: "JetBrains Mono", css: '"JetBrains Mono", ui-monospace, monospace', google: "JetBrains+Mono:wght@400;500;700" },
  { id: "caveat", label: "Caveat (рукописный)", css: '"Caveat", cursive', google: "Caveat:wght@400;600;700" },
];

interface MxPrefs {
  theme: MxTheme;
  accent: string; // пусто = акцент сайта (оранжевый Velox)
  textSize: number; // px, 13–19
  enterToSend: boolean;
  bubbleStyle: "round" | "classic" | "compact" | "outline" | "glass"; // форма пузырей сообщений
  font: string; // id шрифта из FONT_CHOICES
  profileTheme: "auto" | "dark" | "light"; // тема карточки профиля
  linkPreviews: boolean; // карточки-превью ссылок под сообщениями
  quickReplies: string[]; // быстрые ответы (шаблоны)
  wallpaper: string; // id обоев чата ("none" / пусто — без обоев)
  setTheme: (t: MxTheme) => void;
  setFont: (id: string) => void;
  setAccent: (a: string) => void;
  setTextSize: (n: number) => void;
  setEnterToSend: (v: boolean) => void;
  setProfileTheme: (v: "auto" | "dark" | "light") => void;
  setLinkPreviews: (v: boolean) => void;
  setQuickReplies: (l: string[]) => void;
  setWallpaper: (id: string) => void;
  setBubbleStyle: (b: "round" | "classic" | "compact" | "outline" | "glass") => void;
}

export const ACCENT_CHOICES = ["", "#3390ec", "#34c759", "#af52de", "#ff2d55", "#00b8d9", "#ffcc00"];

export const useMxPrefs = create<MxPrefs>()(
  persist(
    (set) => ({
      theme: "dark",
      font: "",
      accent: "",
      textSize: 15,
      enterToSend: true,
      profileTheme: "auto",
      linkPreviews: true,
      quickReplies: [],
      wallpaper: "none",
      bubbleStyle: "round",
      setTheme: (theme) => set({ theme }),
      setFont: (font) => set({ font }),
      setAccent: (accent) => set({ accent }),
      setTextSize: (textSize) => set({ textSize }),
      setEnterToSend: (enterToSend) => set({ enterToSend }),
      setProfileTheme: (profileTheme) => set({ profileTheme }),
      setLinkPreviews: (linkPreviews) => set({ linkPreviews }),
      setQuickReplies: (quickReplies) => set({ quickReplies }),
      setWallpaper: (wallpaper) => set({ wallpaper }),
      setBubbleStyle: (bubbleStyle) => set({ bubbleStyle }),
    }),
    { name: "mx-prefs" }
  )
);
