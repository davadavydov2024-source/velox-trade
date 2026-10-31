/**
 * Подарки MiliGram — общий каталог для сервера и клиента.
 * Обычные подарки стоят от 5 до 50 ⭐ (кошелёк Velox: users.starsWallet).
 * `limited` — ограниченный тираж: когда раскуплено, подарок исчезает из магазина.
 * NFT-подарки (уникальные, с номером/моделью/фоном/узором) добавим позже: под них уже есть тип GiftNft и поле `nft` у выданного подарка.
 */

export type GiftCategory = "bears" | "hearts" | "roses" | "gems" | "party" | "rare" | "nft" | "halloween";

export interface GiftDef {
  id: string;
  emoji: string;
  title: string;
  price: number; // ⭐
  category: GiftCategory;
  colors: [string, string]; // градиент плитки
  limited?: number; // тираж; без поля — безлимит
  nft?: boolean; // уникальный NFT-подарок: при покупке выпадают номер, модель, фон и узор (limited = тираж)
}

export const GIFT_MIN_PRICE = 5;
export const GIFT_MAX_PRICE = 50;
export const GIFT_CONVERT_RATE = 0.8; // сколько ⭐ вернётся, если получатель обменяет подарок на звёзды
export const GIFT_MESSAGE_MAX = 120;
export const GIFT_PIN_MAX = 6; // сколько подарков можно закрепить в профиле (как в Telegram)
export const GIFT_SALE_FEE = 0.1; // комиссия с продажи другому пользователю
export const GIFT_SALE_MIN = 1;
export const GIFT_SALE_MAX = 100_000;

export const GIFT_CATEGORIES: { id: "all" | GiftCategory; label: string }[] = [
  { id: "all", label: "Все подарки" },
  { id: "roses", label: "🌹 Цветы" },
  { id: "hearts", label: "💝 Сердца" },
  { id: "bears", label: "🧸 Мишки" },
  { id: "gems", label: "💎 Драгоценности" },
  { id: "party", label: "🎉 Праздник" },
  { id: "rare", label: "🏆 Редкие" },
  { id: "halloween", label: "🎃 Хеллоуин" },
  { id: "nft", label: "✨ NFT" },
];

export const GIFTS: GiftDef[] = [
  // — обычные, 5 ⭐
  { id: "bear", emoji: "🧸", title: "Мишка", price: 5, category: "bears", colors: ["#3a2a1c", "#1d1610"] },
  { id: "heart", emoji: "💝", title: "Сердце с бантом", price: 5, category: "hearts", colors: ["#4a1c3a", "#1f0e1a"] },
  { id: "rose", emoji: "🌹", title: "Роза", price: 5, category: "roses", colors: ["#3d1418", "#1c0a0c"] },
  { id: "tulip", emoji: "🌷", title: "Тюльпан", price: 5, category: "roses", colors: ["#3d1a2c", "#1c0d15"] },
  { id: "popper", emoji: "🎉", title: "Хлопушка", price: 5, category: "party", colors: ["#3b2f12", "#1a150a"] },
  // — подороже
  { id: "bouquet", emoji: "💐", title: "Букет", price: 10, category: "roses", colors: ["#3a1c3f", "#1a0e1d"] },
  { id: "giftbox", emoji: "🎁", title: "Подарочная коробка", price: 10, category: "party", colors: ["#13313d", "#0a171c"] },
  { id: "love-letter", emoji: "💌", title: "Любовное письмо", price: 10, category: "hearts", colors: ["#41192c", "#1d0c14"] },
  { id: "teddy-big", emoji: "🐻", title: "Большой мишка", price: 15, category: "bears", colors: ["#41301d", "#1e160d"] },
  { id: "cake", emoji: "🎂", title: "Торт", price: 15, category: "party", colors: ["#40202a", "#1d0f14"] },
  { id: "champagne", emoji: "🍾", title: "Шампанское", price: 15, category: "party", colors: ["#2f3314", "#16180a"] },
  { id: "panda", emoji: "🐼", title: "Панда", price: 25, category: "bears", colors: ["#262a30", "#121417"] },
  { id: "sparkle-heart", emoji: "💖", title: "Сияющее сердце", price: 25, category: "hearts", colors: ["#4a1745", "#210b20"] },
  { id: "trophy", emoji: "🏆", title: "Кубок", price: 25, category: "rare", colors: ["#43361a", "#1e180c"] },
  // — драгоценности и редкие, до 50 ⭐
  { id: "diamond", emoji: "💎", title: "Алмаз", price: 50, category: "gems", colors: ["#123a4a", "#0a1a21"] },
  { id: "ring", emoji: "💍", title: "Кольцо", price: 50, category: "gems", colors: ["#2d2a4a", "#14122a"] },
  { id: "rocket", emoji: "🚀", title: "Ракета", price: 25, category: "nft", nft: true, colors: ["#1b2c4a", "#0d1424"], limited: 5000 },
  { id: "crown", emoji: "👑", title: "Корона", price: 50, category: "nft", nft: true, colors: ["#4a3a10", "#211a08"], limited: 1000 },
  { id: "dragon", emoji: "🐉", title: "Дракон Velox", price: 50, category: "nft", nft: true, colors: ["#16401f", "#0a1d0e"], limited: 500 },
  { id: "nft-bear", emoji: "🧸", title: "Королевский мишка", price: 30, category: "nft", nft: true, colors: ["#41301d", "#1e160d"], limited: 3000 },
  { id: "nft-heart", emoji: "💘", title: "Вечное сердце", price: 40, category: "nft", nft: true, colors: ["#4a1c3a", "#1f0e1a"], limited: 2000 },
  { id: "nft-diamond", emoji: "💠", title: "Кристалл Velox", price: 50, category: "nft", nft: true, colors: ["#123a4a", "#0a1a21"], limited: 777 },
  { id: "nft-clover", emoji: "🍀", title: "Клевер удачи", price: 25, category: "nft", nft: true, colors: ["#16401f", "#0a1d0e"], limited: 4000 },
  // — ещё NFT
  { id: "nft-unicorn", emoji: "🦄", title: "Единорог", price: 40, category: "nft", nft: true, colors: ["#4a2250", "#1f0e24"], limited: 1500 },
  { id: "nft-phoenix", emoji: "🔥", title: "Феникс", price: 50, category: "nft", nft: true, colors: ["#4a2210", "#210e07"], limited: 300 },
  { id: "nft-ufo", emoji: "🛸", title: "НЛО", price: 35, category: "nft", nft: true, colors: ["#1c3a4a", "#0c1a21"], limited: 2000 },
  { id: "nft-moon", emoji: "🌙", title: "Лунный свет", price: 30, category: "nft", nft: true, colors: ["#262b52", "#0f1226"], limited: 3500 },
  { id: "nft-galaxy", emoji: "🌌", title: "Галактика", price: 50, category: "nft", nft: true, colors: ["#2a1f5c", "#0e0a26"], limited: 400 },
  { id: "nft-snowman", emoji: "⛄", title: "Снеговик", price: 25, category: "nft", nft: true, colors: ["#1f3a4f", "#0d1a24"], limited: 4000 },
  { id: "nft-cat", emoji: "🐱", title: "Космокот", price: 30, category: "nft", nft: true, colors: ["#2f2a52", "#13112a"], limited: 3000 },
  { id: "nft-fox", emoji: "🦊", title: "Лис Velox", price: 35, category: "nft", nft: true, colors: ["#4a2a10", "#21130a"], limited: 2500 },
  { id: "nft-wolf", emoji: "🐺", title: "Лунный волк", price: 45, category: "nft", nft: true, colors: ["#2a3340", "#12161d"], limited: 800 },
  { id: "nft-pumpkin", emoji: "🎃", title: "Тыква", price: 25, category: "nft", nft: true, colors: ["#4a2a0c", "#211306"], limited: 4000 },
  { id: "nft-tree", emoji: "🎄", title: "Ёлка", price: 25, category: "nft", nft: true, colors: ["#144024", "#0a1d10"], limited: 4000 },
  { id: "nft-bolt", emoji: "⚡", title: "Молния", price: 30, category: "nft", nft: true, colors: ["#4a4010", "#211c07"], limited: 3000 },
  { id: "nft-sword", emoji: "⚔️", title: "Меч героя", price: 45, category: "nft", nft: true, colors: ["#2d3640", "#14181d"], limited: 600 },
  { id: "nft-potion", emoji: "🧪", title: "Зелье", price: 25, category: "nft", nft: true, colors: ["#2a4a1c", "#122108"], limited: 4500 },
  { id: "nft-ghost", emoji: "👻", title: "Призрак", price: 30, category: "nft", nft: true, colors: ["#33384a", "#16192a"], limited: 3500 },
  { id: "nft-robot", emoji: "🤖", title: "Робот", price: 40, category: "nft", nft: true, colors: ["#26364a", "#10181f"], limited: 1200 },
  { id: "nft-eye", emoji: "🧿", title: "Оберег", price: 35, category: "nft", nft: true, colors: ["#123a4a", "#0a1a21"], limited: 2000 },
  { id: "nft-ice", emoji: "🧊", title: "Ледяной куб", price: 25, category: "nft", nft: true, colors: ["#1c3f52", "#0c1c25"], limited: 4500 },
  { id: "nft-butterfly", emoji: "🦋", title: "Бабочка", price: 30, category: "nft", nft: true, colors: ["#1c2f5a", "#0c1428"], limited: 3000 },
  { id: "nft-whale", emoji: "🐋", title: "Кит", price: 45, category: "nft", nft: true, colors: ["#123650", "#08171f"], limited: 700 },
  { id: "nft-music", emoji: "🎵", title: "Мелодия", price: 25, category: "nft", nft: true, colors: ["#3a2a52", "#18112a"], limited: 5000 },
  { id: "nft-skull", emoji: "💀", title: "Череп", price: 35, category: "nft", nft: true, colors: ["#2c2c33", "#131317"], limited: 1800 },
  // — 🎃 Хеллоуин: лимитированная коллекция (маленькие тиражи, свои фоны, узоры и модели)
  { id: "hw-jack", emoji: "🎃", title: "Тыква-фонарь", price: 50, category: "halloween", nft: true, colors: ["#4a2a0c", "#1c0d02"], limited: 1031 },
  { id: "hw-vampire", emoji: "🧛", title: "Граф Вампир", price: 50, category: "halloween", nft: true, colors: ["#3a0f1a", "#14060a"], limited: 666 },
  { id: "hw-bat", emoji: "🦇", title: "Летучая мышь", price: 40, category: "halloween", nft: true, colors: ["#2a1f4a", "#0d0a1c"], limited: 1000 },
  { id: "hw-hat", emoji: "🧙", title: "Шляпа ведьмы", price: 45, category: "halloween", nft: true, colors: ["#2a1a52", "#0e0820"], limited: 777 },
  { id: "hw-cauldron", emoji: "🧪", title: "Котёл с зельем", price: 45, category: "halloween", nft: true, colors: ["#143a22", "#08150d"], limited: 500 },
  { id: "hw-cat", emoji: "🐈‍⬛", title: "Чёрный кот", price: 40, category: "halloween", nft: true, colors: ["#24243a", "#0c0c16"], limited: 666 },
  { id: "hw-spider", emoji: "🕷️", title: "Паук-ткач", price: 35, category: "halloween", nft: true, colors: ["#2a2250", "#0e0b20"], limited: 1300 },
  { id: "hw-ghost", emoji: "👻", title: "Призрак-джентльмен", price: 35, category: "halloween", nft: true, colors: ["#33384a", "#14172a"], limited: 1500 },
  { id: "hw-candy", emoji: "🍬", title: "Конфета или жизнь", price: 25, category: "halloween", nft: true, colors: ["#4a2210", "#1c0c04"], limited: 2000 },
];

export const giftById = (id: string): GiftDef | undefined => GIFTS.find((g) => g.id === id);

/** Выданный подарок: коллекция messengerGifts. */
export interface MessengerGift {
  id: string;
  giftId: string;
  from: string; // uid отправителя
  to: string; // uid получателя
  price: number; // сколько ⭐ заплатил отправитель
  message?: string;
  anonymous?: boolean; // скрыть отправителя от всех, кроме получателя
  hidden?: boolean; // получатель скрыл подарок из профиля
  pinned?: boolean; // закреплён вверху профиля
  pinnedAt?: number;
  salePrice?: number; // выставлен на продажу за ⭐ (null/нет — не продаётся)
  at: number;
  nft?: GiftNft; // зарезервировано под NFT-подарки
  byAdmin?: boolean; // выдан администрацией бесплатно (на ⭐ не обменивается)
}

/** Задел под NFT: уникальный экземпляр подарка (как в Telegram — номер, модель, фон, узор). Пока не выдаётся. */
export interface GiftNft {
  number: number; // №123 из supply
  supply: number;
  model: string; // вариант фигурки
  backdrop: string; // фон
  symbol: string; // узор
  imageUrl?: string; // необязательно: готовая картинка вместо отрисовки по признакам
}

/** Запись в ответе GET /api/messenger/gifts?uid= */
export interface GiftView {
  id: string;
  giftId: string;
  price: number;
  message?: string;
  at: number;
  hidden: boolean;
  pinned: boolean;
  salePrice?: number;
  anonymous: boolean;
  from: { uid: string; displayName: string; photoURL: string | null } | null; // null — анонимно
  nft?: GiftNft;
}
