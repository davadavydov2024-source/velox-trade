export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Обычный",
  uncommon: "Необычный",
  rare: "Редкий",
  epic: "Эпический",
  legendary: "Легендарный",
};

export interface Game {
  id: string;
  name: string;
  slug: string;
  image: string;
  productCount?: number;
}

export interface Product {
  id: string;
  gameId: string;
  sellerId: string;
  name: string;
  description: string;
  image: string;
  price: number;
  rarity: Rarity;
  stock: number;
  isNew?: boolean;
  discountPercent?: number;
  createdAt: number;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  sellerId: string;
  items: { productId: string; name: string; price: number; quantity: number }[];
  total: number;
  status: "pending_confirmation" | "confirmed" | "disputed" | "cancelled";
  reviewSubmitted?: boolean;
  createdAt: number;
  confirmedAt?: number;
}

export type UserBadge =
  | "user"
  | "creator"
  | "buyer"
  | "verified"
  | "blogger"
  | "sponsor"
  | "vip"
  | "moderator"
  | "admin"
  | "developer"
  | "founder"
  | "checkmark_blue"
  | "checkmark_grey";

// Бейджи-«галочки» рисуются как значок рядом с именем (как верификация в соцсетях),
// остальные — как цветные плашки под именем.
export const CHECKMARK_BADGES: UserBadge[] = ["checkmark_blue", "checkmark_grey"];

export const BADGE_LABEL: Record<UserBadge, string> = {
  user: "Пользователь",
  creator: "Креатор",
  buyer: "Покупатель",
  verified: "Проверенный",
  blogger: "Блогер",
  sponsor: "Спонсор",
  vip: "VIP",
  moderator: "Модератор",
  admin: "Администратор",
  developer: "Разработчик",
  founder: "Основатель",
  checkmark_blue: "Синяя галочка",
  checkmark_grey: "Серая галочка",
};

export const BADGE_COLOR: Record<UserBadge, string> = {
  user: "#9aa3b2",
  creator: "#ff5722",
  buyer: "#4caf50",
  verified: "#2196f3",
  blogger: "#e91e63",
  sponsor: "#9c27b0",
  vip: "#ff9800",
  moderator: "#00bcd4",
  admin: "#f44336",
  developer: "#8bc34a",
  founder: "#ffd700",
  checkmark_blue: "#1d9bf0",
  checkmark_grey: "#8a8d91",
};

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  username?: string;
  bio?: string;
  photoURL?: string | null;
  balance: number;
  badges: UserBadge[];
  emailVerified: boolean;
  banned: boolean;
  banReason?: string;
  banUntil?: number | "forever" | null;
  createdAt: number;
  lastLoginAt: number;
  lastNameChangeAt?: number;
  lastAvatarChangeAt?: number;
  ratingSum?: number;
  ratingCount?: number;
}

export const NAME_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export interface OrderChatMessage {
  from: "buyer" | "seller" | "admin";
  text: string;
  createdAt: number;
}

export interface OrderChat {
  orderId: string;
  buyerId: string;
  sellerId: string;
  messages: OrderChatMessage[];
  updatedAt: number;
}

export interface Review {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  sellerId: string;
  buyerId: string;
  buyerName: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  createdAt: number;
}

export interface SiteSettings {
  primaryColor: string;
  secondaryColor: string;
  bgColor: string;
  siteName: string;
  darkMode: boolean;
  updatedAt: number;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  primaryColor: "#ff9800",
  secondaryColor: "#ffb74d",
  bgColor: "#0d1017",
  siteName: "Velox Trade",
  darkMode: true,
  updatedAt: 0,
};

export interface Ad {
  id: string;
  title: string;
  description: string;
  image: string;
  color: string;
  buttonText: string;
  buttonLink: string;
  endsAt: number | null;
  priority: number;
  active: boolean;
  createdAt: number;
}

export interface TicketMessage {
  from: "user" | "admin";
  text: string;
  createdAt: number;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  status: "open" | "answered" | "closed";
  messages: TicketMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface FeatureFlags {
  registrationEnabled: boolean;
  googleLoginEnabled: boolean;
  telegramLoginEnabled: boolean;
  telegramRegisterEnabled: boolean;
  balanceTopupEnabled: boolean;
  updatedAt: number;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  registrationEnabled: true,
  googleLoginEnabled: true,
  telegramLoginEnabled: false,
  telegramRegisterEnabled: false,
  balanceTopupEnabled: true,
  updatedAt: 0,
};

export interface Dispute {
  id: string; // совпадает с orderId
  orderId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  reason: string;
  status: "open" | "approved" | "rejected";
  createdAt: number;
  resolvedAt?: number;
}

export interface TopUpRequest {
  id: string;
  userId: string;
  userNick: string;
  amount: number;
  type: "deposit" | "withdraw";
  method?: "qr" | "playerok" | "funpay" | "phone";
  comment?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface Payment {
  id: string; // совпадает с order_id, который мы передаём в CactusPay
  userId: string;
  userNick: string;
  amount: number;
  status: "pending" | "paid" | "failed" | "cancelled";
  cactusPaymentId?: number;
  paymentUrl?: string;
  createdAt: number;
  paidAt?: number;
  cancelledAt?: number;
}

export interface SellRequest {
  id: string;
  userId: string;
  userNick: string;
  itemName: string;
  game: string;
  price: number;
  description: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

// ---- Промокоды ----
// "discount" — обычная скидка, применяется в корзине при оформлении заказа.
// "gift" — промо-подарок, активируется в личном кабинете (раздел «Промо-подарки»)
// и сразу же выдаёт награду: пополнение баланса или бесплатный предмет из каталога.
export type PromoCodeType = "discount" | "gift";
export type PromoGiftType = "balance" | "product";

export interface PromoCode {
  id: string;
  code: string;
  type: PromoCodeType;
  discountPercent?: number; // только для type === "discount"
  giftType?: PromoGiftType; // только для type === "gift"
  giftBalance?: number; // только для giftType === "balance"
  giftProductId?: string; // только для giftType === "product"
  giftProductName?: string;
  giftProductImage?: string;
  maxUses: number | null; // null = без ограничения по числу активаций
  usedBy: string[]; // uid пользователей, которые уже использовали этот код (каждый код — один раз на человека)
  active: boolean;
  expiresAt: number | null;
  createdAt: number;
}

// ---- Канал новостей (раздел «Чаты») ----
export interface NewsButton {
  text: string;
  link: string;
}

export interface NewsPost {
  id: string;
  text: string;
  image?: string | null;
  buttons: NewsButton[];
  createdAt: number;
}
