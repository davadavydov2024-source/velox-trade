import { Rarity } from "@/types";

export type AchievementCategory = "purchases" | "sales" | "wheel" | "community" | "account" | "trust";

/** Ключ статистики, с которой сравнивается порог достижения — считается на сервере в /api/achievements. */
export type AchievementStatKey =
  | "buyerConfirmedOrders"
  | "sellerConfirmedOrders"
  | "wheelSpins"
  | "referrals"
  | "accountAgeDays"
  | "emailVerified"
  | "ratingCount"
  | "twoFactorEnabled"
  | "profileComplete"
  | "eventsParticipated";

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  statKey: AchievementStatKey;
  threshold: number; // для булевых статов (emailVerified и т.п.) — просто 1
  rarity: Rarity; // чисто визуальная классификация — как редкость товаров, для цвета карточки
  secret?: boolean; // показывается как "???" пока не открыто
}

// Достижения — чисто престижные, без денежной награды: значок в профиле и место в статистике.
export const ACHIEVEMENTS: AchievementDef[] = [
  // --- Покупки ---
  { id: "first_purchase", title: "Первая покупка", description: "Соверши свою первую подтверждённую покупку", category: "purchases", statKey: "buyerConfirmedOrders", threshold: 1, rarity: "common" },
  { id: "buyer_5", title: "Активный покупатель", description: "5 подтверждённых покупок", category: "purchases", statKey: "buyerConfirmedOrders", threshold: 5, rarity: "uncommon" },
  { id: "buyer_10", title: "Постоянный покупатель", description: "10 подтверждённых покупок", category: "purchases", statKey: "buyerConfirmedOrders", threshold: 10, rarity: "rare" },
  { id: "buyer_25", title: "Коллекционер", description: "25 подтверждённых покупок", category: "purchases", statKey: "buyerConfirmedOrders", threshold: 25, rarity: "epic", secret: true },
  { id: "buyer_50", title: "Шопоголик", description: "50 подтверждённых покупок", category: "purchases", statKey: "buyerConfirmedOrders", threshold: 50, rarity: "legendary", secret: true },

  // --- Продажи ---
  { id: "first_sale", title: "Первая продажа", description: "Соверши свою первую продажу", category: "sales", statKey: "sellerConfirmedOrders", threshold: 1, rarity: "common" },
  { id: "seller_5", title: "Начинающий торговец", description: "5 подтверждённых продаж", category: "sales", statKey: "sellerConfirmedOrders", threshold: 5, rarity: "uncommon" },
  { id: "seller_10", title: "Опытный продавец", description: "10 подтверждённых продаж", category: "sales", statKey: "sellerConfirmedOrders", threshold: 10, rarity: "rare" },
  { id: "seller_25", title: "Мастер сделок", description: "25 подтверждённых продаж", category: "sales", statKey: "sellerConfirmedOrders", threshold: 25, rarity: "epic", secret: true },
  { id: "seller_50", title: "Топ продавец", description: "50 подтверждённых продаж", category: "sales", statKey: "sellerConfirmedOrders", threshold: 50, rarity: "legendary", secret: true },

  // --- Колесо фортуны ---
  { id: "wheel_first_spin", title: "Испытал удачу", description: "Прокрути колесо фортуны первый раз", category: "wheel", statKey: "wheelSpins", threshold: 1, rarity: "common" },
  { id: "wheel_10_spins", title: "Азартный игрок", description: "10 прокруток колеса фортуны", category: "wheel", statKey: "wheelSpins", threshold: 10, rarity: "uncommon" },
  { id: "wheel_25_spins", title: "Завсегдатай колеса", description: "25 прокруток колеса фортуны", category: "wheel", statKey: "wheelSpins", threshold: 25, rarity: "rare" },
  { id: "wheel_50_spins", title: "Везунчик", description: "50 прокруток колеса фортуны", category: "wheel", statKey: "wheelSpins", threshold: 50, rarity: "epic", secret: true },
  { id: "wheel_100_spins", title: "Легенда колеса", description: "100 прокруток колеса фортуны", category: "wheel", statKey: "wheelSpins", threshold: 100, rarity: "legendary", secret: true },

  // --- Сообщество ---
  { id: "referral_1", title: "Амбассадор", description: "Пригласи первого друга по реферальной ссылке", category: "community", statKey: "referrals", threshold: 1, rarity: "common" },
  { id: "referral_5", title: "Проводник", description: "Пригласи 5 друзей по реферальной ссылке", category: "community", statKey: "referrals", threshold: 5, rarity: "rare" },
  { id: "referral_10", title: "Инфлюенсер", description: "Пригласи 10 друзей по реферальной ссылке", category: "community", statKey: "referrals", threshold: 10, rarity: "epic", secret: true },
  { id: "referral_25", title: "Основатель сообщества", description: "Пригласи 25 друзей по реферальной ссылке", category: "community", statKey: "referrals", threshold: 25, rarity: "legendary", secret: true },
  { id: "events_1", title: "Участник ивента", description: "Прими участие в первом ивенте сайта", category: "community", statKey: "eventsParticipated", threshold: 1, rarity: "uncommon" },
  { id: "events_5", title: "Душа компании", description: "Прими участие в 5 ивентах сайта", category: "community", statKey: "eventsParticipated", threshold: 5, rarity: "epic", secret: true },

  // --- Аккаунт ---
  { id: "verified_email", title: "Подтверждённый аккаунт", description: "Подтверди почту", category: "account", statKey: "emailVerified", threshold: 1, rarity: "common" },
  { id: "profile_complete", title: "Личность", description: "Загрузи аватар и заполни описание профиля", category: "account", statKey: "profileComplete", threshold: 1, rarity: "uncommon" },
  { id: "twofa_enabled", title: "Крепость", description: "Включи двухфакторную защиту аккаунта", category: "account", statKey: "twoFactorEnabled", threshold: 1, rarity: "rare" },
  { id: "veteran_7", title: "Новичок освоился", description: "Аккаунту больше 7 дней", category: "account", statKey: "accountAgeDays", threshold: 7, rarity: "common" },
  { id: "veteran_30", title: "Ветеран", description: "Аккаунту больше 30 дней", category: "account", statKey: "accountAgeDays", threshold: 30, rarity: "uncommon" },
  { id: "veteran_90", title: "Старожил", description: "Аккаунту больше 90 дней", category: "account", statKey: "accountAgeDays", threshold: 90, rarity: "rare" },
  { id: "veteran_365", title: "Легенда сайта", description: "Аккаунту больше года", category: "account", statKey: "accountAgeDays", threshold: 365, rarity: "legendary", secret: true },

  // --- Доверие ---
  { id: "trusted_1", title: "Первый отзыв", description: "Получи первый отзыв как продавец", category: "trust", statKey: "ratingCount", threshold: 1, rarity: "common" },
  { id: "trusted_5", title: "Доверие", description: "Получи 5 отзывов как продавец", category: "trust", statKey: "ratingCount", threshold: 5, rarity: "uncommon" },
  { id: "trusted_15", title: "Надёжный продавец", description: "Получи 15 отзывов как продавец", category: "trust", statKey: "ratingCount", threshold: 15, rarity: "rare" },
  { id: "trusted_30", title: "Икона доверия", description: "Получи 30 отзывов как продавец", category: "trust", statKey: "ratingCount", threshold: 30, rarity: "epic", secret: true },
];

export const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  purchases: "Покупки",
  sales: "Продажи",
  wheel: "Колесо фортуны",
  community: "Сообщество",
  account: "Аккаунт",
  trust: "Доверие",
};
