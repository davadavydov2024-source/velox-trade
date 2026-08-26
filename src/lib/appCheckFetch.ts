import { firebaseApp } from "./firebase";

/**
 * Получает свежий App Check-токен (reCAPTCHA v3, невидимая — без чекбокса) и прикладывает его в
 * заголовок X-Firebase-AppCheck. Используется на важных серверных роутах — регистрация, ставки в
 * аукционе, покупки (см. lib/firebaseAdmin.ts → verifyAppCheck). Обычный auth-запрос сюда не
 * входит — App Check это отдельный уровень защиты "запрос идёт из настоящего приложения",
 * а не "кто вошёл", это дополняет, а не заменяет проверку ID-токена пользователя.
 */
export async function getAppCheckHeader(): Promise<Record<string, string>> {
  try {
    const { getToken } = await import("firebase/app-check");
    const { getAppCheckInstance } = await import("./firebase");
    const instance = await getAppCheckInstance();
    if (!instance) return {};
    const result = await getToken(instance, false);
    return { "X-Firebase-AppCheck": result.token };
  } catch {
    // App Check не инициализировался (например, нет ключа в .env) — запрос уйдёт без токена,
    // сервер сам решит по APP_CHECK_ENFORCEMENT, пропускать его или отклонить.
    return {};
  }
}

/** fetch(), который сам добавляет Content-Type и App Check заголовок — чтобы не дублировать это в каждом api-вызове. */
export async function appCheckedFetch(url: string, body: unknown, extraHeaders?: Record<string, string>) {
  const appCheckHeader = await getAppCheckHeader();
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...appCheckHeader, ...(extraHeaders ?? {}) },
    body: JSON.stringify(body),
  });
}
