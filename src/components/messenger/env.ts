/** Где запущен мессенджер: в браузере, в Windows-приложении (Electron) или в Android-приложении (Capacitor). */
export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.() || /Electron\//.test(navigator.userAgent);
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true || !!window.matchMedia?.("(display-mode: standalone)").matches;
}
