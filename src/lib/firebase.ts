import { initializeApp, getApps, getApp, FirebaseOptions } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getActiveSlotId, getSavedAccounts, PRIMARY_SLOT } from "./accountSlots";

export const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Избегаем повторной инициализации при HMR в дев-режиме Next.js
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

/**
 * Мультиаккаунт: у каждого добавленного аккаунта (кроме самого первого — "primary") есть свой
 * ИМЕНОВАННЫЙ Firebase App, а значит и своя изолированная персистентность сессии в браузере.
 * "primary" — это обычный дефолтный App, как и было раньше (важно для обратной совместимости:
 * у людей, кто уже был залогинен ДО этой фичи, сессия лежит именно в дефолтном App).
 * При загрузке страницы смотрим, какой слот сейчас активен (localStorage) — и auth/db ниже
 * сразу указывают на нужный аккаунт. Переключение аккаунта делает полный reload страницы
 * (см. lib/multiAccount.ts) — так что здесь достаточно решить это один раз при старте.
 */
function resolveActiveApp() {
  const activeSlot = getActiveSlotId();
  if (activeSlot === PRIMARY_SLOT) return firebaseApp;
  const saved = getSavedAccounts().find((a) => a.slotId === activeSlot);
  if (!saved) return firebaseApp; // слот потерялся/удалён — откатываемся на primary
  const appName = `vt-${activeSlot}`;
  return getApps().find((a) => a.name === appName) ?? initializeApp(firebaseConfig, appName);
}

const activeApp = resolveActiveApp();

export const auth = getAuth(activeApp);
export const db = getFirestore(activeApp);
// Firebase Storage больше не используется — загрузка файлов переведена на Vercel Blob
// (см. src/lib/storage.ts), чтобы не требовать платный тариф Blaze.
export const googleProvider = new GoogleAuthProvider();

// Analytics работает только в браузере и только если поддерживается окружением
export async function getAnalyticsSafe() {
  if (typeof window === "undefined") return null;
  try {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    if (await isSupported()) {
      return getAnalytics(firebaseApp);
    }
  } catch {
    // analytics недоступна (например, заблокирована блокировщиком рекламы) — не критично
  }
  return null;
}
