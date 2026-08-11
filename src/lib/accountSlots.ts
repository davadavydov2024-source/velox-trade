"use client";

/**
 * Мультиаккаунт хранит только МЕТАДАННЫЕ добавленных аккаунтов (uid, email, имя, аватар,
 * технический slotId). Сама сессия/токены не хранятся тут — за это отвечает встроенная
 * персистентность Firebase Auth, отдельная под каждый именованный Firebase App (см. firebase.ts).
 */

export interface SavedAccount {
  slotId: string; // "primary" — обычный дефолтный Firebase App (уже существующие сессии).
  // Для остальных — slotId это суффикс имени доп. Firebase App (`vt-<slotId>`).
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

export const PRIMARY_SLOT = "primary";
const ACCOUNTS_KEY = "vt_accounts";
const ACTIVE_KEY = "vt_active_account";

export function getSavedAccounts(): SavedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as SavedAccount[]) : [];
  } catch {
    return [];
  }
}

export function setSavedAccounts(list: SavedAccount[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

export function upsertSavedAccount(acc: SavedAccount) {
  const list = getSavedAccounts().filter((a) => a.uid !== acc.uid);
  list.push(acc);
  setSavedAccounts(list);
}

export function removeSavedAccountBySlot(slotId: string) {
  setSavedAccounts(getSavedAccounts().filter((a) => a.slotId !== slotId));
}

/** "primary", пока пользователь не переключился на добавленный аккаунт. */
export function getActiveSlotId(): string {
  if (typeof window === "undefined") return PRIMARY_SLOT;
  return localStorage.getItem(ACTIVE_KEY) || PRIMARY_SLOT;
}

export function setActiveSlotId(slotId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_KEY, slotId);
}
