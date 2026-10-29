/**
 * Определение платформы для установки приложения и push-уведомлений. Клиентские функции —
 * на сервере (SSR) безопасно возвращают false.
 */

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iosDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ маскируется под Mac Safari — отличаем по тачскрину, у настольного Mac его нет.
  const iPadOs13 = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iosDevice || iPadOs13;
}

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/** Сайт открыт как установленное приложение (иконка на экране «Домой» / PWA / APK-обёртка TWA). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (window.navigator as any).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

/** Есть ли в этом браузере API уведомлений. На iPhone он появляется ТОЛЬКО в установленном
 * приложении и только на iOS 16.4+ — в обычной вкладке Safari объекта Notification нет вообще. */
export function hasNotificationApi(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}
