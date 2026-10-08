/**
 * Мультиаккаунт хранит только МЕТАДАННЫЕ добавленных аккаунтов (uid, email, имя, аватар,
 * технический slotId). Сама сессия/токены не хранятся тут — за это отвечает встроенная
 * персистентность Firebase Auth, отдельная под каждый именованный Firebase App (см. firebase.ts).
 *
 * Без "use client": это обычный модуль с localStorage, а не React-компонент. firebase.ts
 * (который использует и сервер — например, sitemap.ts во время сборки) импортирует этот файл,
 * и директива "use client" в такой цепочке ломает серверную сборку Next.js.
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
export const ACTIVE_KEY = "vt_active_account";
const NOTICE_KEY = "vt_switch_notice";
/** Событие «список аккаунтов изменился» — на него подписан переключатель, чтобы обновляться сразу,
 * а не только после перезагрузки страницы (раньше он вообще не появлялся после первого входа). */
export const ACCOUNTS_EVENT = "vt-accounts-changed";

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
  window.dispatchEvent(new Event(ACCOUNTS_EVENT));
}

/** Один и тот же аккаунт не может лежать в двух слотах, и в одном слоте не может быть двух аккаунтов.
 * Раньше фильтровали только по uid — если в слоте "primary" входили сначала под A, потом под B,
 * в списке оставались ДВЕ записи "primary", и переключение на A открывало B. */
export function upsertSavedAccount(acc: SavedAccount) {
  const prev = getSavedAccounts();
  const list = prev.filter((a) => a.uid !== acc.uid && a.slotId !== acc.slotId);
  list.push(acc);
  // Не пишем и не шлём событие, если ничего не изменилось (иначе будет лишний ререндер на каждый вход).
  const old = prev.find((a) => a.slotId === acc.slotId);
  if (
    old &&
    old.uid === acc.uid &&
    old.email === acc.email &&
    old.displayName === acc.displayName &&
    old.photoURL === acc.photoURL &&
    prev.length === list.length
  ) {
    return;
  }
  // Порядок стабильный: в порядке добавления, а не «последний вошедший — в конец».
  const order = new Map(prev.map((a, i) => [a.slotId, i]));
  list.sort((a, b) => (order.get(a.slotId) ?? 999) - (order.get(b.slotId) ?? 999));
  setSavedAccounts(list);
}

export function subscribeAccounts(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === ACCOUNTS_KEY || e.key === null) cb();
  };
  window.addEventListener(ACCOUNTS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(ACCOUNTS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Слот, под которым ЭТА загрузка страницы реально подняла Firebase (см. firebase.ts). Решается один
 * раз за загрузку и дальше не меняется — в отличие от getActiveSlotId(), который может поменять другая
 * вкладка. Если в localStorage указан слот, которого нет в списке (удалили/потеряли), откатываемся на
 * primary и сразу чиним указатель — раньше authContext продолжал писать данные в потерянный слот. */
let loadedSlot: string | null = null;
export function getLoadedSlotId(): string {
  if (typeof window === "undefined") return PRIMARY_SLOT; // на сервере не кэшируем
  if (loadedSlot) return loadedSlot;
  const active = getActiveSlotId();
  if (active === PRIMARY_SLOT || getSavedAccounts().some((a) => a.slotId === active)) {
    loadedSlot = active;
  } else {
    loadedSlot = PRIMARY_SLOT;
    localStorage.setItem(ACTIVE_KEY, PRIMARY_SLOT);
  }
  return loadedSlot;
}

/** Суффикс для ключей localStorage, которые должны быть раздельными у разных аккаунтов (корзина и т.п.). */
export function slotStorageSuffix(): string {
  const s = getLoadedSlotId();
  return s === PRIMARY_SLOT ? "" : `:${s}`;
}

/** Флаг «выходим сами» — чтобы обработчик потерянной сессии не принял штатный выход за аварийный. */
let intentionalSignOut = false;
export function markIntentionalSignOut() {
  intentionalSignOut = true;
}
export function isIntentionalSignOut() {
  return intentionalSignOut;
}
export function resetIntentionalSignOut() {
  intentionalSignOut = false;
}

/** Короткое сообщение, которое переживает перезагрузку страницы (например «сессия истекла»). */
export function setSwitchNotice(msg: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(NOTICE_KEY, msg);
  } catch {
    // sessionStorage недоступен — просто не покажем сообщение
  }
}
export function popSwitchNotice(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(NOTICE_KEY);
    if (v) sessionStorage.removeItem(NOTICE_KEY);
    return v;
  } catch {
    return null;
  }
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
