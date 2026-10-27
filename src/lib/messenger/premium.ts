/** Mili Premium: цена, срок и лимиты — общие для сервера и клиента. */
export const PREMIUM_PRICE_STARS = 10; // ⭐ за период
export const PREMIUM_DAYS = 30;

export const LIMITS = {
  free: { folders: 10, pinnedChats: 5 },
  premium: { folders: 20, pinnedChats: 10 },
} as const;

export const isPremium = (a: { premiumUntil?: number } | null | undefined): boolean => !!a?.premiumUntil && a.premiumUntil > Date.now();
export const limitsFor = (a: { premiumUntil?: number } | null | undefined) => (isPremium(a) ? LIMITS.premium : LIMITS.free);

export const STICKER_IMPORT_LIMIT = { free: 3, premium: 30 } as const; // сколько наборов из Telegram можно привезти самому

/** Эмодзи-статусы рядом с ником (только Premium). Вместо эмодзи можно поставить свой NFT-подарок. */
export const STATUS_EMOJIS = ["⭐", "🔥", "💎", "👑", "🚀", "🌈", "🦄", "🐉", "🍀", "🎯", "💫", "🌙", "⚡", "🎮", "🏆", "❤️", "🧸", "🌹", "🎁", "😎"];

/** Плюсы Mili Premium — показываются на странице подписки. */
export const PREMIUM_PERKS: { icon: string; title: string; text: string }[] = [
  { icon: "✨", title: "Статус рядом с ником", text: "Эмодзи или твой NFT-подарок светится возле имени в чатах и профиле." },
  { icon: "🧩", title: "Премиум-стикеры", text: "Эксклюзивные наборы, которые доступны только подписчикам." },
  { icon: "📥", title: "Стикеры из Telegram", text: `Вставь ссылку на стикерпак — он скачается в мессенджер. До ${STICKER_IMPORT_LIMIT.premium} наборов (без Premium — ${STICKER_IMPORT_LIMIT.free}).` },
  { icon: "📁", title: "Больше папок и закрепов", text: `${LIMITS.premium.folders} папок и ${LIMITS.premium.pinnedChats} закреплённых чатов вместо ${LIMITS.free.folders} и ${LIMITS.free.pinnedChats}.` },
  { icon: "⭐", title: "Значок Premium", text: "Золотая отметка в профиле — все видят, что ты с нами." },
];
