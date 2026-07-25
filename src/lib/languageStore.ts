"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { Language, DEFAULT_LANGUAGE, t } from "./i18n";
import { cookieStorage } from "./cookies";

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

/** Текущий язык интерфейса, хранится в куке (velox-trade-language), а не в localStorage —
 *  так его может прочитать и сервер при первом рендере страницы. Синхронизируется с профилем
 *  через UserLanguageSync. */
export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: DEFAULT_LANGUAGE,
      setLanguage: (language) => set({ language }),
    }),
    { name: "velox-trade-language", storage: createJSONStorage(() => cookieStorage) }
  )
);

/** Удобный хук: { language, setLanguage, t } — t(key) сразу переводит на текущий язык. */
export function useLanguage() {
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  return { language, setLanguage, t: (key: string) => t(language, key) };
}
