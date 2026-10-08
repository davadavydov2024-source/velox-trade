"use client";

import { initializeApp, deleteApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signInWithPopup, signOut, GoogleAuthProvider, Auth } from "firebase/auth";
import { firebaseConfig, firebaseApp } from "./firebase";
import {
  SavedAccount,
  PRIMARY_SLOT,
  getSavedAccounts,
  upsertSavedAccount,
  removeSavedAccountBySlot,
  getActiveSlotId,
  setActiveSlotId,
  getLoadedSlotId,
  markIntentionalSignOut,
} from "./accountSlots";

export { getSavedAccounts, getActiveSlotId, getLoadedSlotId, PRIMARY_SLOT } from "./accountSlots";
export type { SavedAccount } from "./accountSlots";

function randomSlotId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `slot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Уже есть 5 аккаунтов — больше не даём добавлять, чтобы не плодить лишние Firebase App-инстансы в браузере. */
export const MAX_ACCOUNTS = 5;

function authForSlot(slotId: string): Auth {
  if (slotId === PRIMARY_SLOT) return getAuth(firebaseApp);
  const name = `vt-${slotId}`;
  return getAuth(getApps().find((a) => a.name === name) ?? initializeApp(firebaseConfig, name));
}

/** Общая часть «добавить аккаунт»: логин в отдельном изолированном Firebase App (не трогая текущую
 * активную сессию), проверка дубля/лимита, сохранение в список и выбор активным. После успеха страницу
 * нужно перезагрузить (см. вызовы в UI) — так все real-time подписки сайта переинициализируются. */
async function addAccount(signIn: (a: Auth) => ReturnType<typeof signInWithEmailAndPassword>, fallbackEmail: string): Promise<SavedAccount> {
  if (getSavedAccounts().length >= MAX_ACCOUNTS) {
    throw new Error(`Можно добавить не больше ${MAX_ACCOUNTS} аккаунтов`);
  }
  const slotId = randomSlotId();
  const app = initializeApp(firebaseConfig, `vt-${slotId}`);
  try {
    const cred = await signIn(getAuth(app));
    const existing = getSavedAccounts().find((a) => a.uid === cred.user.uid);
    if (existing) {
      // Этот человек уже в списке — временный App выбрасываем и подсказываем, куда переключиться.
      await signOut(getAuth(app)).catch(() => {});
      await deleteApp(app).catch(() => {});
      throw new Error("Этот аккаунт уже добавлен — выбери его в списке");
    }
    const acc: SavedAccount = {
      slotId,
      uid: cred.user.uid,
      email: cred.user.email ?? fallbackEmail,
      displayName: cred.user.displayName ?? cred.user.email ?? "Игрок",
      photoURL: cred.user.photoURL ?? undefined,
    };
    upsertSavedAccount(acc);
    setActiveSlotId(slotId);
    return acc;
  } catch (err) {
    await deleteApp(app).catch(() => {});
    throw err;
  }
}

export function addAccountByEmail(email: string, password: string): Promise<SavedAccount> {
  return addAccount((a) => signInWithEmailAndPassword(a, email, password), email);
}

export function addAccountByGoogle(): Promise<SavedAccount> {
  return addAccount((a) => signInWithPopup(a, new GoogleAuthProvider()) as any, "");
}

/** Регистрирует уже вошедшего пользователя (обычный логин/регистрация на "primary") в списке переключателя. */
export function registerPrimaryAccount(acc: Omit<SavedAccount, "slotId">) {
  upsertSavedAccount({ ...acc, slotId: PRIMARY_SLOT });
}

/** Переключение всегда идёт через полную перезагрузку страницы — так безопаснее для всех real-time подписок сайта. */
export function switchAccount(slotId: string, to = "/profile") {
  if (slotId === getLoadedSlotId()) return;
  if (!getSavedAccounts().some((a) => a.slotId === slotId)) return; // слот уже удалён (например в другой вкладке)
  setActiveSlotId(slotId);
  window.location.assign(to);
}

/**
 * Выход из аккаунта в слоте (или удаление неактивного из списка). Для АКТИВНОГО слота дальше:
 *  • есть другие аккаунты — переключаемся на первый из них;
 *  • других нет и слот был не "primary" — перезагружаемся на primary (иначе сайт остался бы
 *    привязан к опустевшему слоту, и следующий вход «пропал бы» после перезагрузки);
 *  • других нет и это primary — просто остаёмся разлогиненными.
 */
export async function removeAccount(slotId: string) {
  const loaded = getLoadedSlotId();
  if (slotId === loaded) markIntentionalSignOut();
  await signOut(authForSlot(slotId)).catch(() => {});
  removeSavedAccountBySlot(slotId);

  if (slotId !== loaded) return;

  const next = getSavedAccounts()[0];
  if (next) {
    setActiveSlotId(next.slotId);
    window.location.assign("/profile");
    return;
  }
  setActiveSlotId(PRIMARY_SLOT);
  if (loaded !== PRIMARY_SLOT) window.location.assign("/auth/login");
}
