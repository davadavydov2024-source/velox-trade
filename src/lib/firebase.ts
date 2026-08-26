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
export { activeApp }; // нужен для firebase/messaging (см. lib/webPush.ts) — messaging тоже должен
// смотреть на правильный (возможно неосновной) аккаунт при мультиаккаунте, как auth/db выше.
// Firebase Storage больше не используется — загрузка файлов переведена на Vercel Blob
// (см. src/lib/storage.ts), чтобы не требовать платный тариф Blaze.
export const googleProvider = new GoogleAuthProvider();

/**
 * App Check (reCAPTCHA v3) — невидимая защита от ботов, без чекбокса и картинок. Инициализируем
 * лениво и только в браузере: App Check требует synchronous window при импорте модуля, а этот
 * файл может исполняться и на сервере (некоторые lib/* импортируют firebase.ts для типов).
 * isTokenAutoRefreshEnabled: true — токен обновляется в фоне сам, без нашего участия, как и
 * ID-токен авторизации.
 * Debug-токен для локальной разработки: Firebase сам печатает случайный UUID в консоль браузера
 * при первом запуске на localhost — его нужно один раз добавить в Firebase Console → App Check →
 * вкладка "Debug tokens", иначе запросы с localhost будут отклоняться как неверифицированные.
 */
let appCheckInitialized = false;
let appCheckInstance: any = null;
let appCheckReady: Promise<any> | null = null;

export function ensureAppCheck() {
  if (typeof window === "undefined" || appCheckInitialized) return;
  appCheckInitialized = true;
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!siteKey) {
    console.warn("NEXT_PUBLIC_RECAPTCHA_SITE_KEY не задан — App Check не активирован.");
    return;
  }
  appCheckReady = import("firebase/app-check").then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
    appCheckInstance = initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    return appCheckInstance;
  });
}

/** Дожидается инициализации App Check (если она уже запущена через ensureAppCheck()) и отдаёт
 * instance — используется в lib/appCheckFetch.ts перед самым первым запросом после захода на
 * сайт, чтобы не словить ложный отказ сервера из-за гонки между инициализацией и первым fetch. */
export async function getAppCheckInstance() {
  if (appCheckInstance) return appCheckInstance;
  if (appCheckReady) return appCheckReady;
  return null;
}

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
