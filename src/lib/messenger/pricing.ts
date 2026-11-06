/** Цены Mili Premium в рублях (оплата картой / СБП / криптой через RollyPay — тот же способ, что и пополнение баланса Velox Trade). Поменяй числа — изменится и страница оплаты, и условия подписки. */
export const PREMIUM_PRICE_RUB = 60;
export const PLUS_PRICE_RUB = 77;
export const PREMIUM_PLANS = {
  premium: { title: "Mili Premium", rub: PREMIUM_PRICE_RUB, days: 30 },
  plus: { title: "Премиум Плюс", rub: PLUS_PRICE_RUB, days: 30 },
} as const;
export type PremiumPlan = keyof typeof PREMIUM_PLANS;
/** Версия документов, которую принял покупатель (пишется в платёж). */
export const DOCS_VERSION = "2026-11-06";
/** Документы, с которыми соглашается покупатель перед оплатой. */
export const PAY_DOCS: { href: string; title: string }[] = [
  { href: "/premium-terms", title: "Условия подписки Mili Premium" },
  { href: "/terms", title: "Пользовательское соглашение" },
  { href: "/privacy", title: "Политику конфиденциальности" },
];
