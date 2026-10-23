/** Mili Premium: цена, срок и лимиты — общие для сервера и клиента. */
export const PREMIUM_PRICE_STARS = 10; // ⭐ за период
export const PREMIUM_DAYS = 30;

export const LIMITS = {
  free: { folders: 10, pinnedChats: 5 },
  premium: { folders: 20, pinnedChats: 10 },
} as const;

export const isPremium = (a: { premiumUntil?: number } | null | undefined): boolean => !!a?.premiumUntil && a.premiumUntil > Date.now();
export const limitsFor = (a: { premiumUntil?: number } | null | undefined) => (isPremium(a) ? LIMITS.premium : LIMITS.free);
