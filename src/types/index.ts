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

// ---- Боты-посредники для передачи предметов внутри игры (эскроу) ----
// "Бот" тут — не телеграм-бот, а игровой аккаунт-посредник (как миддлмен в Standoff2/CS/Roblox):
// продавец передаёт предмет НА этот аккаунт, админ вручную подтверждает получение и выдачу,
// так как готового API для автоматической передачи предметов внутри игр обычно нет.
export interface BotAccount {
  id: string;
  gameId: string; // slug игры, для которой используется этот аккаунт-посредник
  nickname: string;
  profileLink?: string;
  active: boolean;
  createdAt: number;
}

export type DeliveryMethod = "seller" | "bot";

export type DeliveryStatus =
  | "awaiting_method" // продавец ещё не выбрал способ выдачи (сам / через бота)
  | "awaiting_nickname" // способ "через бота" выбран, покупатель ещё не вписал свой игровой ник
  | "awaiting_transfer" // ник вписан, ждём пока продавец передаст предмет боту-посреднику
  | "received_by_bot" // админ подтвердил: бот получил предмет от продавца
  | "delivered" // админ подтвердил: предмет выдан покупателю
  | "cancelled" // админ отменил выдачу вручную (спор, ошибка, невозможность передачи и т.п.)
  | "expired"; // не успели уложиться в отведённое время (1 час)

// Один Delivery на один Order (id документа = orderId) — и для обычных покупок, и для призов
// колеса фортуны (оба пути создают Order, см. api/orders/checkout и api/wheel/spin).
export interface Delivery {
  id: string; // = orderId
  orderId: string;
  source: "purchase" | "wheel" | "trade"; // wheel — приз колеса, trade — прямой обмен между игроками
  tradeId?: string; // только для source === "trade" — обе стороны обмена ссылаются на один TradeOffer
  buyerId: string;
  sellerId: string;
  productId: string;
  productName: string;
  gameId: string;
  // Продавец выбирает способ выдачи заново для каждого заказа (не хранится в товаре).
  // Пока не выбран — method отсутствует, а status === "awaiting_method".
  method?: DeliveryMethod;
  methodChosenAt?: number;
  buyerNickname?: string;
  buyerNicknameSubmittedAt?: number;
  botAccountId?: string;
  botNickname?: string; // снимок на момент назначения — не меняется задним числом, если бот-аккаунт потом отредактируют
  botProfileLink?: string;
  status: DeliveryStatus;
  createdAt: number;
  // Ограничение по времени (1 час) действует ТОЛЬКО для призов колеса фортуны — там это часть
  // правил ивента. Обычные покупки не горят: expiresAt для них не задаётся (undefined = без срока).
  expiresAt?: number;
  receivedAt?: number;
  receivedByAdminUid?: string;
  deliveredAt?: number;
  deliveredByAdminUid?: string;
  cancelledAt?: number;
  cancelledByAdminUid?: string;
  cancelReason?: string;
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
  boostTier?: "game" | "home"; // продвижение продавцом за баланс — "home" старше "game"
  boostUntil?: number; // до какого момента (Date.now()) продвижение активно
  editCount?: number; // сколько раз продавец уже редактировал этот товар (лимит — 3)
  createdAt: number;
}

export interface ProductEditRequest {
  id: string;
  productId: string;
  sellerId: string;
  productName: string; // название на момент подачи — для удобства админа
  proposedName: string;
  proposedDescription: string;
  proposedPrice: number;
  proposedImage: string;
  status: "pending" | "approved" | "rejected";
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

export interface PushCategories {
  purchases: boolean; // купили ваш товар, выиграли на колесе фортуны, отдали товар по промокоду
  messages: boolean; // сообщения в чате заказа, ответы поддержки, сообщения от администратора
  reminders: boolean; // буст товара закончился, забытая корзина
  news: boolean; // рассылки и объявления от администрации сайта
}

export const DEFAULT_PUSH_CATEGORIES: PushCategories = {
  purchases: true,
  messages: true,
  reminders: true,
  news: true,
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
  language?: "ru" | "en" | "zh";
  referralCode?: string;
  referredBy?: string; // uid того, кто пригласил (заполняется один раз, при регистрации по ссылке)
  claimedEventIds?: string[]; // id ивентов, за которые уже получен бонус (чтобы не выдавать повторно)
  unlockedAchievements?: string[]; // id достижений, за которые уже начислена награда (см. /profile/achievements)
  // Персонал сайта БЕЗ доступа к админке: менеджер отвечает на обращения в поддержку,
  // помощник получает уведомления о выигрышах на колесе и помогает с их выдачей.
  // Назначается администратором в /admin/users. Не путать с полноценными правами админа
  // (список UID в NEXT_PUBLIC_ADMIN_UIDS) — у этих ролей доступ строго ограничен по функциям.
  staffRole?: "manager" | "helper" | null;
  lastActiveAt?: number; // обновляется периодически, пока открыт сайт — для статуса "в сети"
  lastWheelSpinAt?: number; // когда последний раз крутили колесо фортуны — раз в 7 часов
  wheelSpinsCount?: number; // сколько раз всего крутили колесо — для страницы достижений
  twoFactorEnabled?: boolean; // сам секрет и резервные коды НЕ хранятся тут — только в серверной коллекции twoFactorSecrets
  pushCategories?: PushCategories; // отсутствует у старых профилей — тогда считаем, что включено всё (DEFAULT_PUSH_CATEGORIES)
}

export type EventTheme = "winter" | "summer" | "birthday" | "milestone" | "update" | "weekly" | "none";

export interface SiteEvent {
  id: string;
  name: string; // "Зима", "Лето", "День 67", "ДР админа" и т.д.
  bonusRub: number; // сколько начисляется на баланс при получении бонуса ивента
  theme: EventTheme;
  active: boolean; // показывать ли сейчас на сайте (обычно активен один ивент за раз)
  createdAt: number;
}

export const NAME_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Сессия одного устройства/браузера (Профиль → Безопасность, "как в Telegram").
 * Документ хранится в коллекции `sessions` с id = `${uid}_${deviceId}`. */
export interface UserSession {
  uid: string;
  deviceId: string;
  deviceLabel: string; // например "Chrome · Windows"
  createdAt: number; // первый вход именно с этого устройства
  lastActiveAt: number;
  revoked: boolean;
  revokedAt?: number | null;
}

export interface OrderChatMessage {
  from: "buyer" | "seller" | "admin" | "system";
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

export type TradeOfferStatus = "pending" | "accepted" | "rejected" | "cancelled";

// Прямой обмен предметами между двумя игроками (не покупка за деньги, хотя можно доплатить
// сверху). При принятии создаются ДВЕ записи Delivery (см. выше) — по одной на каждое
// направление передачи предмета, обе идут через тех же ботов-посредников, что и обычные покупки.
export interface TradeOffer {
  id: string;
  fromUserId: string; // тот, кто предложил обмен
  fromUserNick: string;
  toUserId: string; // владелец запрошенного предмета
  toUserNick: string;
  offeredProductId: string;
  offeredProductName: string;
  offeredProductImage?: string;
  offeredGameId: string;
  requestedProductId: string;
  requestedProductName: string;
  requestedProductImage?: string;
  requestedGameId: string;
  extraBalanceFromProposer?: number; // предложивший обмен доплачивает сверху своего предмета
  message?: string;
  status: TradeOfferStatus;
  createdAt: number;
  respondedAt?: number;
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

/** Отзыв о самом сайте/сервисе (не о конкретном товаре) — показывается на странице отзывов. */
export interface SiteReview {
  id: string;
  userId: string;
  userName: string;
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

export interface AppNotification {
  id: string;
  title: string;
  text: string;
  category: "trade" | "transactions" | "general";
  color: string;
  pinned: boolean;
  active: boolean;
  buttonText: string;
  buttonLink: string;
  createdAt: number;
}

/** Подписка браузера на Web Push — одна запись на устройство/браузер (у одного пользователя
 * может быть несколько, если он заходил с разных устройств). */
export interface WebPushSubscription {
  uid: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: number;
}

/** Настраиваемый "закрывающий" экран — на весь сайт (тех.перерыв), для поддержки, для
 * пополнения, или для 404. Админ задаёт картинку, заголовок, описание и до 10 кнопок. */
export interface SiteScreenButton {
  text: string;
  link: string;
}

export interface SiteScreen {
  id: "global" | "support" | "topup" | "notfound";
  enabled: boolean;
  image: string;
  title: string;
  description: string;
  buttons: SiteScreenButton[];
  updatedAt: number;
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
  minTopupAmountRub: number; // минимальная сумма пополнения баланса
  minProductPriceRub: number; // минимальная цена при создании товара (в админке и в заявках на продажу)
  referralEnabled: boolean;
  referralBonusRub: number; // бонус на баланс и приглашённому, и пригласившему за регистрацию по реф-ссылке
  sellCommissionPercent: number; // комиссия платформы с продажи предмета через "Продать предметы", %
  boostGamePriceRub: number; // цена продвижения "в топ игры" за период boostGameDays
  boostGameDays: number;
  boostHomePriceRub: number; // цена продвижения "на главную" за период boostHomeDays (старший тир)
  boostHomeDays: number;
  updatedAt: number;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  registrationEnabled: true,
  googleLoginEnabled: true,
  telegramLoginEnabled: true,
  telegramRegisterEnabled: false,
  balanceTopupEnabled: true,
  minTopupAmountRub: 50,
  minProductPriceRub: 1,
  referralEnabled: true,
  referralBonusRub: 50,
  sellCommissionPercent: 20,
  boostGamePriceRub: 49,
  boostGameDays: 3,
  boostHomePriceRub: 149,
  boostHomeDays: 3,
  updatedAt: 0,
};

export interface Dispute {
  id: string; // совпадает с orderId
  orderId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  reason: string;
  filedBy: "buyer" | "seller";
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
  id: string; // совпадает с order_id, который мы передаём в RollyPay
  userId: string;
  userNick: string;
  amount: number;
  status: "pending" | "paid" | "failed" | "cancelled";
  rollyPaymentId?: string;
  paymentUrl?: string;
  createdAt: number;
  paidAt?: number;
  cancelledAt?: number;
}

export const MIN_SELL_PRICE = 78;

export interface SellRequest {
  id: string;
  userId: string;
  userNick: string;
  itemName: string;
  gameId: string;
  gameName: string;
  imageUrl: string;
  price: number; // цена, которую хочет получить продавец (то, что он ввёл в форме)
  discountPercent?: number; // необязательная скидка от самого продавца — переносится на товар при одобрении
  commissionPercent: number; // комиссия платформы на момент подачи заявки (снимок текущей настройки, чтобы не менялась задним числом)
  description: string;
  stock: number; // количество предметов на продажу
  rarity: Rarity;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

// ---- Промокоды ----
// "discount" — обычная скидка, применяется в корзине при оформлении заказа.
// "gift" — промо-подарок, активируется в личном кабинете (раздел «Промо-подарки»)
// и сразу же выдаёт награду: пополнение баланса или бесплатный предмет из каталога.
export type PromoCodeType = "discount" | "gift" | "wheel";
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

// ---- Колесо Фортуны ----
export type WheelPrizeType = "product" | "balance" | "nothing";

export interface WheelPrize {
  id: string;
  type: WheelPrizeType;
  name: string; // название приза (для "nothing" — например "Пусто")
  image?: string; // для товара — картинка из каталога
  productId?: string; // только для type === "product"
  balanceRub?: number; // только для type === "balance"
  weight: number; // "вес" — шанс выпадения относительно других призов (не обязательно проценты)
  remaining: number; // сколько раз ещё можно выиграть этот приз — при 0 приз пропадает из колеса
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

// ---- Публичная лента "живых покупок" на главной странице ----
export interface PublicActivityItem {
  id: string;
  buyerNickMasked: string; // "FrostDragon" -> "Fr***gon", см. src/lib/maskNickname.ts
  productName: string;
  image?: string | null;
  price: number;
  type: "purchase" | "wheel";
  createdAt: number;
}
