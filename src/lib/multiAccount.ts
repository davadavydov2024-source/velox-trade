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

/**
 * Всегда даёт РЕАЛЬНУЮ перезагрузку страницы, а не просто смену URL. Раньше везде ниже стояло
 * window.location.href = "/profile" — но переключатель аккаунтов рендерится именно на /profile
 * (см. profile/layout.tsx), и если человек уже там (самый частый случай — дефолтная страница
 * после входа), браузер получает команду перейти на ТОТ ЖЕ САМЫЙ адрес, на котором уже стоит,
 * и в большинстве браузеров это тихо ничего не делает — ни перехода, ни перезагрузки. А
 * firebase.ts выбирает нужный Firebase App только ОДИН РАЗ при загрузке страницы (см.
 * resolveActiveApp() в firebase.ts) — без реальной перезагрузки сайт продолжает работать со
 * старым аккаунтом, хотя activeSlotId в localStorage уже сменился. Отсюда и баг "аккаунт
 * добавляется/помечается активным, но переключиться на него не получается".
 */
export function goToProfileHard() {
  if (window.location.pathname === "/profile" && !window.location.search) {
    window.location.reload();
  } else {
    window.location.href = "/profile";
  }
}

function randomSlotId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `slot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Уже есть 5 аккаунтов — больше не даём добавлять, чтобы не плодить лишние Firebase App-инстансы в браузере. */
export const MAX_ACCOUNTS = 5;

class MultiAccountError extends Error {}

/**
 * Логинит НОВЫЙ аккаунт в отдельном изолированном Firebase App (не трогая текущую активную
 * сессию), сохраняет его в список и делает активным. После успеха страницу нужно перезагрузить
 * (см. вызовы в UI) — так все real-time подписки сайта переинициализируются уже на новый аккаунт.
 */
export async function addAccountByEmail(email: string, password: string): Promise<SavedAccount> {
  // Раньше это проверялось только в UI (кнопка "Добавить" скрывалась при 5 аккаунтах) — сама
  // функция лимит не проверяла вовсе, так что при устаревшем состоянии интерфейса (например,
  // открытая модалка в другой вкладке) можно было добавить 6-й и больше аккаунтов.
  if (getSavedAccounts().length >= MAX_ACCOUNTS) {
    throw new MultiAccountError(`Максимум ${MAX_ACCOUNTS} аккаунтов одновременно — удали один, чтобы добавить новый`);
  }

  const slotId = randomSlotId();
  const appName = `vt-${slotId}`;
  const app = initializeApp(firebaseConfig, appName);
  let deleted = false;
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
      deleted = true;
      await deleteApp(app);
      throw new MultiAccountError("Этот аккаунт уже добавлен");
    }
    upsertSavedAccount(acc);
    setActiveSlotId(slotId);
    return acc;
  } catch (err) {
    // Без этого флага deleteApp(app) вызывался бы ДВАЖДЫ на уже удалённом инстансе в ветке
    // "аккаунт уже добавлен" выше (она тоже попадает сюда, в catch) — второй вызов на несуществующем
    // App бросал свою собственную ошибку, которая тихо проглатывалась, но была лишней и мусорила консоль.
    if (!deleted) await deleteApp(app).catch(() => {});
    throw err;
  }
}

function mapPopupAuthError(err: any, provider: string): string {
  const code = err?.code;
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return ""; // пользователь сам закрыл окно — это не ошибка, показывать нечего
  }
  if (code === "auth/unauthorized-domain") {
    return "Этот домен не добавлен в Firebase Authentication → Settings → Authorized domains.";
  }
  if (code === "auth/popup-blocked") {
    return "Браузер заблокировал всплывающее окно входа. Разреши всплывающие окна для этого сайта.";
  }
  if (code === "auth/account-exists-with-different-credential") {
    return "Аккаунт с такой почтой уже зарегистрирован другим способом входа.";
  }
  return err?.message || `Не удалось войти через ${provider}`;
}

export async function addAccountByGoogle(): Promise<SavedAccount> {
  if (getSavedAccounts().length >= MAX_ACCOUNTS) {
    throw new MultiAccountError(`Максимум ${MAX_ACCOUNTS} аккаунтов одновременно — удали один, чтобы добавить новый`);
  }

  const slotId = randomSlotId();
  const appName = `vt-${slotId}`;
  const app = initializeApp(firebaseConfig, appName);
  let deleted = false;
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
      deleted = true;
      await deleteApp(app);
      throw new MultiAccountError("Этот аккаунт уже добавлен");
    }
    upsertSavedAccount(acc);
    setActiveSlotId(slotId);
    return acc;
  } catch (err: any) {
    if (!deleted) await deleteApp(app).catch(() => {});
    // Переносим ту же понятную обработку ошибок всплывающего окна, что уже есть на основной
    // странице входа (/auth/login) — раньше здесь была только общая заглушка "Не удалось войти
    // через Google", даже для типичных случаев вроде заблокированного попапа.
    const friendly = mapPopupAuthError(err, "Google");
    if (!friendly) throw new MultiAccountError(""); // закрыл сам — тихо, без текста ошибки
    throw new MultiAccountError(friendly);
  }
}

/** Переключение всегда идёт через полную перезагрузку страницы — так безопаснее для всех real-time подписок сайта. */
export function switchAccount(slotId: string) {
  // Раньше при slotId === активному слоту функция тихо не делала ничего (return), а в UI кнопка
  // переключения на "уже активный" аккаунт была задизейблена (disabled={isActive}) — из-за этого,
  // если localStorage-метка активного слота расходилась с тем, что реально залогинено в браузере
  // (например, после сбойного переключения), человек видел галочку на аккаунте, в который
  // попасть не может, а кликнуть и принудительно пересинхронизироваться было нельзя — тупик.
  // Теперь клик всегда делает жёсткую перезагрузку, даже если слот уже помечен активным —
  // это чинит рассинхрон вместо того, чтобы запирать в нём.
  setActiveSlotId(slotId);
  goToProfileHard();
}

export async function removeAccount(slotId: string) {
  const authInst =
    slotId === PRIMARY_SLOT
      ? getAuth(firebaseApp)
      : getAuth(getApps().find((a) => a.name === `vt-${slotId}`) ?? initializeApp(firebaseConfig, `vt-${slotId}`));
  // Раньше signOut() мог вызваться до того, как Firebase успевал асинхронно восстановить сессию
  // этого слота из IndexedDB (особенно если слот не трогали в текущей вкладке ни разу) — в таком
  // состоянии signOut() у ещё не восстановленного Auth-инстанса иногда молча ничего не делает,
  // и токены того аккаунта оставались валидными в браузере, хотя из списка он уже пропадал.
  // authStateReady() — штатный способ Firebase дождаться этого восстановления перед выходом.
  await authInst.authStateReady().catch(() => {});
  await signOut(authInst).catch(() => {});
  removeSavedAccountBySlot(slotId);

  const wasActive = getActiveSlotId() === slotId;
  if (!wasActive) return;

  const remaining = getSavedAccounts();
  const next = remaining[0]?.slotId ?? PRIMARY_SLOT;
  setActiveSlotId(next);
  goToProfileHard();
}
