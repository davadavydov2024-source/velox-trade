// Инфраструктура мультиязычности. Чтобы добавить ещё один язык — достаточно:
// 1. добавить его код в тип Language и в массив LANGUAGES;
// 2. добавить объект переводов в TRANSLATIONS (можно скопировать английский и перевести построчно).
// Остальной код (переключатель, синхронизация с профилем и т.д.) поймёт новый язык автоматически.

export type Language = "ru" | "en" | "zh";

export const DEFAULT_LANGUAGE: Language = "ru";

export const LANGUAGES: { code: Language; label: string; flag: string }[] = [
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
];

export function isLanguage(value: string | null | undefined): value is Language {
  return !!value && LANGUAGES.some((l) => l.code === value);
}

type Dict = Record<string, string>;

// Общие элементы интерфейса (шапка, подвал, меню профиля, формы входа/регистрации).
// Остальной текст сайта (карточки товаров, админка и т.д.) пока остаётся на русском —
// перевод остальных страниц можно добавлять сюда постепенно по мере необходимости.
const TRANSLATIONS: Record<Language, Dict> = {
  ru: {
    nav_catalog: "Каталог",
    nav_games: "Игры",
    nav_new: "Новинки",
    nav_chats: "Чаты",
    nav_cart: "Корзина",
    nav_profile: "Профиль",
    nav_login: "Войти",
    nav_register: "Регистрация",
    nav_logout: "Выйти",
    nav_admin: "Админка",

    footer_support: "Поддержка",
    footer_support_center: "Центр поддержки",
    footer_faq: "FAQ",
    footer_shop: "Магазин",
    footer_account: "Аккаунт",
    footer_my_account: "Личный кабинет",
    footer_topup: "Пополнить баланс",
    footer_tagline: "Маркетплейс игровых предметов для Roblox.",
    footer_company: "Компания",
    footer_rules: "Правила платформы",
    footer_rights: "Все права защищены.",

    profile_nav_overview: "Профиль",
    profile_nav_orders: "История покупок",
    profile_nav_topup: "Пополнение баланса",
    profile_nav_sell: "Продать предметы",
    profile_nav_promos: "Промо-подарки",
    profile_nav_favorites: "Любимые товары",
    profile_nav_security: "Безопасность",
    profile_nav_appearance: "Оформление",
    profile_nav_admin: "Админ-панель",
    profile_nav_logout: "Выйти",

    auth_register_title: "Регистрация",
    auth_register_subtitle: "Создай аккаунт и начни покупать предметы",
    auth_login_title: "Вход",
    auth_name_placeholder: "Имя пользователя",
    auth_email_placeholder: "Email",
    auth_password_placeholder: "Пароль (мин. 6 символов)",
    auth_submit_register: "Зарегистрироваться",
    auth_submit_creating: "Создаём аккаунт...",
    auth_have_account: "Уже есть аккаунт?",
    auth_login_link: "Войти",
    auth_language_label: "Язык интерфейса",

    common_loading: "Загрузка...",
    common_save: "Сохранить",
    common_cancel: "Отмена",
  },
  en: {
    nav_catalog: "Catalog",
    nav_games: "Games",
    nav_new: "New",
    nav_chats: "Chats",
    nav_cart: "Cart",
    nav_profile: "Profile",
    nav_login: "Log in",
    nav_register: "Sign up",
    nav_logout: "Log out",
    nav_admin: "Admin",

    footer_support: "Support",
    footer_support_center: "Support Center",
    footer_faq: "FAQ",
    footer_shop: "Shop",
    footer_account: "Account",
    footer_my_account: "My Account",
    footer_topup: "Top Up Balance",
    footer_tagline: "Marketplace for Roblox game items.",
    footer_company: "Company",
    footer_rules: "Platform Rules",
    footer_rights: "All rights reserved.",

    profile_nav_overview: "Overview",
    profile_nav_orders: "My Orders",
    profile_nav_topup: "Balance",
    profile_nav_sell: "Sell Items",
    profile_nav_promos: "Promo Gifts",
    profile_nav_favorites: "Favorites",
    profile_nav_security: "Security",
    profile_nav_appearance: "Appearance",
    profile_nav_admin: "Admin Panel",
    profile_nav_logout: "Log out",

    auth_register_title: "Sign up",
    auth_register_subtitle: "Create an account and start buying items",
    auth_login_title: "Log in",
    auth_name_placeholder: "Username",
    auth_email_placeholder: "Email",
    auth_password_placeholder: "Password (min. 6 characters)",
    auth_submit_register: "Create account",
    auth_submit_creating: "Creating account...",
    auth_have_account: "Already have an account?",
    auth_login_link: "Log in",
    auth_language_label: "Interface language",

    common_loading: "Loading...",
    common_save: "Save",
    common_cancel: "Cancel",
  },
  zh: {
    nav_catalog: "商品目录",
    nav_games: "游戏",
    nav_new: "新品",
    nav_chats: "聊天",
    nav_cart: "购物车",
    nav_profile: "个人中心",
    nav_login: "登录",
    nav_register: "注册",
    nav_logout: "退出登录",
    nav_admin: "管理后台",

    footer_support: "支持",
    footer_support_center: "支持中心",
    footer_faq: "常见问题",
    footer_shop: "商店",
    footer_account: "账户",
    footer_my_account: "个人中心",
    footer_topup: "余额充值",
    footer_tagline: "Roblox 游戏物品交易平台。",
    footer_company: "公司",
    footer_rules: "平台规则",
    footer_rights: "版权所有。",

    profile_nav_overview: "概览",
    profile_nav_orders: "我的订单",
    profile_nav_topup: "余额",
    profile_nav_sell: "出售物品",
    profile_nav_promos: "促销礼包",
    profile_nav_favorites: "收藏",
    profile_nav_security: "账户安全",
    profile_nav_appearance: "外观",
    profile_nav_admin: "管理后台",
    profile_nav_logout: "退出登录",

    auth_register_title: "注册",
    auth_register_subtitle: "创建账户并开始购买物品",
    auth_login_title: "登录",
    auth_name_placeholder: "用户名",
    auth_email_placeholder: "电子邮箱",
    auth_password_placeholder: "密码（至少6位）",
    auth_submit_register: "创建账户",
    auth_submit_creating: "正在创建账户...",
    auth_have_account: "已有账户？",
    auth_login_link: "登录",
    auth_language_label: "界面语言",

    common_loading: "加载中...",
    common_save: "保存",
    common_cancel: "取消",
  },
};

export function t(lang: Language, key: string): string {
  return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS[DEFAULT_LANGUAGE][key] ?? key;
}
