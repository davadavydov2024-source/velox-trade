// Небольшие хелперы для работы с куками на клиенте.
// Раньше выбор языка хранился только в localStorage — это работало в браузере, но:
// 1. первый рендер страницы на сервере ничего не знал о языке пользователя (всегда `ru`),
//    из-за чего часть текста на миг показывалась не на том языке или переключение
//    "не применялось" на некоторых страницах до перерендера;
// 2. localStorage недоступен серверным компонентам вообще, а cookie может прочитать и сервер.
// Поэтому язык (и в будущем — другие настройки интерфейса) хранится в куке.

const ONE_YEAR = 60 * 60 * 24 * 365;

export function setCookie(name: string, value: string, maxAgeSeconds: number = ONE_YEAR) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0`;
}

/** Storage-адаптер для zustand/persist, который пишет/читает не localStorage, а куки. */
export const cookieStorage = {
  getItem: (name: string): string | null => getCookie(name),
  setItem: (name: string, value: string) => setCookie(name, value),
  removeItem: (name: string) => deleteCookie(name),
};
