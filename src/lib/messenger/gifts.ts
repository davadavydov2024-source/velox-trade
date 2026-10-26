/**
 * Подарки MiliGram — общий каталог для сервера и клиента.
 * Обычные подарки стоят от 5 до 50 ⭐ (кошелёк Velox: users.starsWallet).
 * `limited` — ограниченный тираж: когда раскуплено, подарок исчезает из магазина.
 * NFT-подарки (уникальные, с номером/моделью/фоном/узором) добавим позже: под них уже есть тип GiftNft и поле `nft` у выданного подарка.
 */

export type GiftCategory = "bears" | "hearts" | "roses" | "gems" | "party" | "rare";

export interface GiftDef {
  id: string;
  emoji: string;
  title: string;
  price: number; // ⭐
  category: GiftCategory;
  colors: [string, string]; // градиент плитки
  limited?: number; // тираж; без поля — безлимит
}

export const GIFT_MIN_PRICE = 5;
export const GIFT_MAX_PRICE = 50;
export const GIFT_CONVERT_RATE = 0.8; // сколько ⭐ вернётся, если получатель обменяет подарок на звёзды
export const GIFT_MESSAGE_MAX = 120;

export const GIFT_CATEGORIES: { id: "all" | GiftCategory; label: string }[] = [
  { id: "all", label: "Все подарки" },
  { id: "roses", label: "🌹 Цветы" },
  { id: "hearts", label: "💝 Сердца" },
  { id: "bears", label: "🧸 Мишки" },
  { id: "gems", label: "💎 Драгоценности" },
  { id: "party", label: "🎉 Праздник" },
  { id: "rare", label: "🔥 Редкие" },
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
  { id: "rocket", emoji: "🚀", title: "Ракета", price: 25, category: "rare", colors: ["#1b2c4a", "#0d1424"], limited: 5000 },
  { id: "crown", emoji: "👑", title: "Корона", price: 50, category: "rare", colors: ["#4a3a10", "#211a08"], limited: 1000 },
  { id: "dragon", emoji: "🐉", title: "Дракон Velox", price: 50, category: "rare", colors: ["#16401f", "#0a1d0e"], limited: 500 },
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
  at: number;
  nft?: GiftNft; // зарезервировано под NFT-подарки
}

/** Задел под NFT: уникальный экземпляр подарка (как в Telegram — номер, модель, фон, узор). Пока не выдаётся. */
export interface GiftNft {
  number: number; // №123 из supply
  supply: number;
  model: string; // вариант фигурки
  backdrop: string; // фон
  symbol: string; // узор
  imageUrl?: string; // готовая картинка (сгенерируем позже)
}

/** Запись в ответе GET /api/messenger/gifts?uid= */
export interface GiftView {
  id: string;
  giftId: string;
  price: number;
  message?: string;
  at: number;
  hidden: boolean;
  anonymous: boolean;
  from: { uid: string; displayName: string; photoURL: string | null } | null; // null — анонимно
  nft?: GiftNft;
}
