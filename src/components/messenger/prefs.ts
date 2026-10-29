"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MxTheme = "dark" | "light" | "system";

interface MxPrefs {
  theme: MxTheme;
  accent: string; // пусто = акцент сайта (оранжевый Velox)
  textSize: number; // px, 13–19
  enterToSend: boolean;
  setTheme: (t: MxTheme) => void;
  setAccent: (a: string) => void;
  setTextSize: (n: number) => void;
  setEnterToSend: (v: boolean) => void;
}

export const ACCENT_CHOICES = ["", "#3390ec", "#34c759", "#af52de", "#ff2d55", "#00b8d9", "#ffcc00"];

export const useMxPrefs = create<MxPrefs>()(
  persist(
    (set) => ({
      theme: "dark",
      accent: "",
      textSize: 15,
      enterToSend: true,
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setTextSize: (textSize) => set({ textSize }),
      setEnterToSend: (enterToSend) => set({ enterToSend }),
    }),
    { name: "mx-prefs" }
  )
);
