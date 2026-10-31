/** Mili Premium: цена, срок и лимиты — общие для сервера и клиента. */
export const PREMIUM_PRICE_STARS = 10; // ⭐ за период
export const PREMIUM_DAYS = 30;

export const LIMITS = {
  free: { folders: 10, pinnedChats: 5 },
  premium: { folders: 20, pinnedChats: 10 },
} as const;

export const PLUS_PRICE_STARS = 49; // ⭐ за период — «Премиум Плюс»
export const PLUS_DAYS = 30;
export const PAID_MESSAGE_MAX = 1000; // максимальная цена одного сообщения, ⭐
export const isPlus = (a: { plusUntil?: number } | null | undefined): boolean => !!a?.plusUntil && a.plusUntil > Date.now();
/** Премиум Плюс включает всё из Mili Premium. */
export const isPremium = (a: { premiumUntil?: number; plusUntil?: number } | null | undefined): boolean => (!!a?.premiumUntil && a.premiumUntil > Date.now()) || isPlus(a);
export const limitsFor = (a: { premiumUntil?: number; plusUntil?: number } | null | undefined) => (isPremium(a) ? LIMITS.premium : LIMITS.free);

export const STICKER_IMPORT_LIMIT = { free: 3, premium: 30 } as const; // сколько наборов из Telegram можно привезти самому

/** Эмодзи-статусы рядом с ником (только Premium). Вместо эмодзи можно поставить свой NFT-подарок. */
export const STATUS_EMOJIS = ["⭐", "🔥", "💎", "👑", "🚀", "🌈", "🦄", "🐉", "🍀", "🎯", "💫", "🌙", "⚡", "🎮", "🏆", "❤️", "🧸", "🌹", "🎁", "😎"];

/** Плюсы Mili Premium — показываются на странице подписки. */
export const PREMIUM_PERKS: { icon: string; title: string; text: string }[] = [
  { icon: "✨", title: "Статус рядом с ником", text: "Эмодзи или твой NFT-подарок светится возле имени в чатах и профиле." },
  { icon: "🧩", title: "Премиум-стикеры", text: "Эксклюзивные наборы, которые доступны только подписчикам." },
  { icon: "📁", title: "Больше папок и закрепов", text: `${LIMITS.premium.folders} папок и ${LIMITS.premium.pinnedChats} закреплённых чатов вместо ${LIMITS.free.folders} и ${LIMITS.free.pinnedChats}.` },
  { icon: "⭐", title: "Значок Premium", text: "Золотая отметка в профиле — все видят, что ты с нами." },
];
