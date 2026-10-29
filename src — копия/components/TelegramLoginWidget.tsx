"use client";

/**
 * Кнопка «Войти через Telegram» — новый официальный вход Telegram (OpenID Connect), см.
 * api/auth/telegram-oidc. Старый iframe-виджет (telegram-widget.js) требовал /setdomain и падал с
 * «bot domain invalid»; новый работает через Client ID из BotFather → Login Widget и обычный
 * переход на oauth.telegram.org, без сторонних скриптов на странице.
 * Пропсы onSuccess сохранены для совместимости со старыми вызовами: переход полностраничный,
 * дальнейшие действия выполняет страница /auth/telegram-finish.
 */
export function TelegramLoginWidget({
  refCode,
}: {
  refCode?: string | null;
  onSuccess?: () => void;
}) {
  const href = `/api/auth/telegram-oidc/start${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`;
  return (
    <a
      href={href}
      className="w-full flex items-center justify-center gap-2.5 py-3 rounded-btn font-medium text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.99]"
      style={{ background: "#2AABEE" }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M9.78 15.17 9.6 19.3c.35 0 .5-.15.69-.33l1.66-1.59 3.44 2.52c.63.35 1.08.17 1.25-.58l2.26-10.6c.2-.93-.34-1.3-.95-1.07L4.6 12.8c-.9.35-.89.85-.15 1.08l3.4 1.06 7.9-4.98c.37-.24.71-.11.43.13" />
      </svg>
      Войти через Telegram
    </a>
  );
}
