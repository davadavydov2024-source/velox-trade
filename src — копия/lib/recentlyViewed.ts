const KEY = "recentlyViewed";
const MAX_ITEMS = 12;

export function addRecentlyViewed(productId: string): void {
  if (typeof window === "undefined") return;
  try {
    const ids: string[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    const next = [productId, ...ids.filter((id) => id !== productId)].slice(0, MAX_ITEMS);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — просто не запоминаем, не критично
  }
}

export function getRecentlyViewedIds(excludeId?: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const ids: string[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return excludeId ? ids.filter((id) => id !== excludeId) : ids;
  } catch {
    return [];
  }
}
