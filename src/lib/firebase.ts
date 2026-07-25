import { initializeApp, getApps, getApp, FirebaseOptions } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Избегаем повторной инициализации при HMR в дев-режиме Next.js
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
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
