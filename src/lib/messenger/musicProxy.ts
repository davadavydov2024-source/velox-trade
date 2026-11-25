/**
 * Обход для тех, у кого не открывается домен Vercel Blob: песни тогда идут через наш сайт (/api/messenger/music-stream).
 * Флажок запоминается в браузере, чтобы каждый следующий трек не ждал неудачной попытки напрямую.
 */
const KEY = "mx-music-proxy";

export function isProxyOn(): boolean {
  try { return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function setProxyOn(on = true): void {
  try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch {}
}
/** Ссылка на песню через наш сайт (абсолютная — чтобы совпадала с audio.src). Чужие адреса и blob: не трогаем. */
export function proxied(url: string): string {
  if (typeof window === "undefined" || !/^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//i.test(url)) return url;
  return `${window.location.origin}/api/messenger/music-stream?u=${encodeURIComponent(url)}`;
}
