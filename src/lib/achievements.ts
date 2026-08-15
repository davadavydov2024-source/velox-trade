export type AchievementCategory = "purchases" | "sales" | "wheel" | "community" | "account" | "trust";

/** Ключ статистики, с которой сравнивается порог достижения — считается на сервере в /api/achievements. */
export type AchievementStatKey =
  | "buyerConfirmedOrders"
  | "sellerConfirmedOrders"
  | "wheelSpins"
  | "referrals"
  | "accountAgeDays"
  | "emailVerified"
  | "ratingCount";

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  statKey: AchievementStatKey;
  threshold: number; // для emailVerified — 1 (просто булево "достигнуто/нет")
  rewardRub?: number; // разовая награда на баланс при разблокировке (необязательна)
  secret?: boolean; // скрыто (показывается как "???") пока не открыто соседнее достижение той же категории
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // --- Покупки ---
  { id: "first_purchase", title: "Первая покупка", description: "Соверши свою первую подтверждённую покупку", category: "purchases", statKey: "buyerConfirmedOrders", threshold: 1, rewardRub: 20 },
  { id: "buyer_10", title: "Постоянный покупатель", description: "10 подтверждённых покупок", category: "purchases", statKey: "buyerConfirmedOrders", threshold: 10, rewardRub: 50 },
  { id: "buyer_25", title: "Коллекционер", description: "25 подтверждённых покупок", category: "purchases", statKey: "buyerConfirmedOrders", threshold: 25, rewardRub: 150, secret: true },

  // --- Продажи ---
  { id: "first_sale", title: "Первая продажа", description: "Соверши свою первую продажу", category: "sales", statKey: "sellerConfirmedOrders", threshold: 1, rewardRub: 20 },
  { id: "seller_10", title: "Опытный продавец", description: "10 подтверждённых продаж", category: "sales", statKey: "sellerConfirmedOrders", threshold: 10, rewardRub: 50 },
  { id: "seller_50", title: "Топ продавец", description: "50 подтверждённых продаж", category: "sales", statKey: "sellerConfirmedOrders", threshold: 50, rewardRub: 300, secret: true },

  // --- Колесо фортуны ---
  { id: "wheel_first_spin", title: "Испытал удачу", description: "Прокрути колесо фортуны первый раз", category: "wheel", statKey: "wheelSpins", threshold: 1, rewardRub: 10 },
  { id: "wheel_10_spins", title: "Азартный игрок", description: "10 прокруток колеса фортуны", category: "wheel", statKey: "wheelSpins", threshold: 10, rewardRub: 50 },
  { id: "wheel_50_spins", title: "Легенда колеса", description: "50 прокруток колеса фортуны", category: "wheel", statKey: "wheelSpins", threshold: 50, rewardRub: 200, secret: true },

  // --- Сообщество ---
  { id: "referral_1", title: "Амбассадор", description: "Пригласи первого друга по реферальной ссылке", category: "community", statKey: "referrals", threshold: 1, rewardRub: 30 },
  { id: "referral_10", title: "Инфлюенсер", description: "Пригласи 10 друзей по реферальной ссылке", category: "community", statKey: "referrals", threshold: 10, rewardRub: 200, secret: true },

  // --- Аккаунт ---
  { id: "verified_email", title: "Подтверждённый аккаунт", description: "Подтверди почту", category: "account", statKey: "emailVerified", threshold: 1, rewardRub: 10 },
  { id: "veteran_30", title: "Ветеран", description: "Аккаунту больше 30 дней", category: "account", statKey: "accountAgeDays", threshold: 30 },
  { id: "veteran_180", title: "Старожил", description: "Аккаунту больше 180 дней", category: "account", statKey: "accountAgeDays", threshold: 180, secret: true },

  // --- Доверие ---
  { id: "trusted_5", title: "Доверие", description: "Получи 5 отзывов как продавец", category: "trust", statKey: "ratingCount", threshold: 5, rewardRub: 40 },
];

export const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  purchases: "Покупки",
  sales: "Продажи",
  wheel: "Колесо фортуны",
  community: "Сообщество",
  account: "Аккаунт",
  trust: "Доверие",
};
