/** Кэш недавних песен в браузере (Cache API): повторный запуск и переход к следующей песне — мгновенно, даже при плохой связи. */
const NAME = "mx-music-v1";
const MAX = 12; // сколько песен храним
const inflight = new Set<string>();

type NetInfo = { saveData?: boolean; effectiveType?: string };
const conn = (): NetInfo | undefined => (typeof navigator !== "undefined" ? (navigator as Navigator & { connection?: NetInfo }).connection : undefined);

/** Режим экономии трафика включён. */
export const isSaveData = () => !!conn()?.saveData;
/** Медленная сеть (2G/3G) или экономия трафика: тогда играем лёгкую копию и ничего заранее не качаем. */
export const isSlowNet = () => {
  const c = conn();
  return !!c && (!!c.saveData || /^(slow-2g|2g|3g)$/.test(c.effectiveType ?? ""));
};

export async function cacheTrack(url: string): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window) || inflight.has(url) || url.startsWith("blob:")) return;
  inflight.add(url);
  try {
    const c = await caches.open(NAME);
    if (await c.match(url)) return;
    const res = await fetch(url);
    if (!res.ok || res.status === 206 || Number(res.headers.get("content-length") || 0) > 40 * 1024 * 1024) return;
    await c.put(url, res);
    const keys = await c.keys(); // порядок — по времени добавления: старые удаляем
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX))) await c.delete(k);
  } catch {} finally {
    inflight.delete(url);
  }
}

/** Песня из кэша как blob:-ссылка (или null, если в кэше нет). Ссылку нужно потом освободить через URL.revokeObjectURL. */
export async function getCachedBlobUrl(url: string): Promise<string | null> {
  try {
    if (typeof window === "undefined" || !("caches" in window)) return null;
    const r = await (await caches.open(NAME)).match(url);
    if (!r) return null;
    const b = await r.blob();
    return URL.createObjectURL(b.type.startsWith("audio/") ? b : new Blob([b], { type: "audio/mpeg" }));
  } catch {
    return null;
  }
}
