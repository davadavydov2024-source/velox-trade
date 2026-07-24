"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Language, DEFAULT_LANGUAGE, t } from "./i18n";

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

/** Текущий язык интерфейса, хранится в браузере. Синхронизируется с профилем через UserLanguageSync. */
export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: DEFAULT_LANGUAGE,
      setLanguage: (language) => set({ language }),
    }),
    { name: "velox-trade-language" }
  )
);

/** Удобный хук: { language, setLanguage, t } — t(key) сразу переводит на текущий язык. */
export function useLanguage() {
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  return { language, setLanguage, t: (key: string) => t(language, key) };
}
