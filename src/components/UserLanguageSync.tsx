"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/authContext";
import { useLanguageStore } from "@/lib/languageStore";
import { isLanguage } from "@/lib/i18n";

/**
 * Когда пользователь логинится, подтягивает язык, сохранённый в его профиле (например, выбранный
 * при регистрации на другом устройстве), в локальный переключатель языка этого браузера.
 * Работает один раз на сессию входа, чтобы не перетирать ручной выбор языка прямо во время визита.
 */
export function UserLanguageSync() {
  const { profile } = useAuth();
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    if (syncedFor.current === profile.uid) return;
    if (isLanguage(profile.language)) {
      setLanguage(profile.language);
    }
    syncedFor.current = profile.uid;
  }, [profile, setLanguage]);

  return null;
}
