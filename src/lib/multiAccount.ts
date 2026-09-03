"use client";

import { initializeApp, deleteApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signInWithPopup, signOut, GoogleAuthProvider } from "firebase/auth";
import { firebaseConfig, firebaseApp } from "./firebase";
import {
  SavedAccount,
  PRIMARY_SLOT,
  getSavedAccounts,
  upsertSavedAccount,
  removeSavedAccountBySlot,
  getActiveSlotId,
  setActiveSlotId,
} from "./accountSlots";

export { getSavedAccounts, getActiveSlotId, PRIMARY_SLOT } from "./accountSlots";
export type { SavedAccount } from "./accountSlots";

function randomSlotId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `slot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Уже есть 5 аккаунтов — больше не даём добавлять, чтобы не плодить лишние Firebase App-инстансы в браузере. */
export const MAX_ACCOUNTS = 5;

/**
 * Логинит НОВЫЙ аккаунт в отдельном изолированном Firebase App (не трогая текущую активную
 * сессию), сохраняет его в список и делает активным. После успеха страницу нужно перезагрузить
 * (см. вызовы в UI) — так все real-time подписки сайта переинициализируются уже на новый аккаунт.
 */
export async function addAccountByEmail(email: string, password: string): Promise<SavedAccount> {
  const slotId = randomSlotId();
  const appName = `vt-${slotId}`;
  const app = initializeApp(firebaseConfig, appName);
  try {
    const authInst = getAuth(app);
    const cred = await signInWithEmailAndPassword(authInst, email, password);
    const acc: SavedAccount = {
      slotId,
      uid: cred.user.uid,
      email: cred.user.email ?? email,
      displayName: cred.user.displayName ?? cred.user.email ?? "Игрок",
      photoURL: cred.user.photoURL ?? undefined,
    };
    if (getSavedAccounts().some((a) => a.uid === acc.uid)) {
      await deleteApp(app);
      throw new Error("Этот аккаунт уже добавлен");
    }
    upsertSavedAccount(acc);
    setActiveSlotId(slotId);
    return acc;
  } catch (err) {
    await deleteApp(app).catch(() => {});
    throw err;
  }
}

export async function addAccountByGoogle(): Promise<SavedAccount> {
  const slotId = randomSlotId();
  const appName = `vt-${slotId}`;
  const app = initializeApp(firebaseConfig, appName);
  try {
    const authInst = getAuth(app);
    const cred = await signInWithPopup(authInst, new GoogleAuthProvider());
    const acc: SavedAccount = {
      slotId,
      uid: cred.user.uid,
      email: cred.user.email ?? "",
      displayName: cred.user.displayName ?? cred.user.email ?? "Игрок",
      photoURL: cred.user.photoURL ?? undefined,
    };
    if (getSavedAccounts().some((a) => a.uid === acc.uid)) {
      await deleteApp(app);
      throw new Error("Этот аккаунт уже добавлен");
    }
    upsertSavedAccount(acc);
    setActiveSlotId(slotId);
    return acc;
  } catch (err) {
    await deleteApp(app).catch(() => {});
    throw err;
  }
}

/** Регистрирует уже вошедшего пользователя (обычный логин/регистрация на "primary") в списке переключателя. */
export function registerPrimaryAccount(acc: Omit<SavedAccount, "slotId">) {
  upsertSavedAccount({ ...acc, slotId: PRIMARY_SLOT });
}

/** Переключение всегда идёт через полную перезагрузку страницы — так безопаснее для всех real-time подписок сайта. */
export function switchAccount(slotId: string) {
  if (slotId === getActiveSlotId()) return;
  setActiveSlotId(slotId);
  window.location.href = "/profile";
}

export async function removeAccount(slotId: string) {
  const authInst =
    slotId === PRIMARY_SLOT
      ? getAuth(firebaseApp)
      : getAuth(getApps().find((a) => a.name === `vt-${slotId}`) ?? initializeApp(firebaseConfig, `vt-${slotId}`));
  await signOut(authInst).catch(() => {});
  removeSavedAccountBySlot(slotId);

  const wasActive = getActiveSlotId() === slotId;
  if (!wasActive) return;

  const remaining = getSavedAccounts();
  const next = remaining[0]?.slotId ?? PRIMARY_SLOT;
  setActiveSlotId(next);
  window.location.href = "/profile";
}
