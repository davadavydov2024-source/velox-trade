/** Заголовки безопасности. Выделены в отдельный модуль, чтобы их можно было тестировать. */
const ENFORCED_CSP = [
  "frame-ancestors 'none'", // запрет встраивания сайта в чужой <iframe> (clickjacking)
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

// Полная политика пока в режиме Report-Only: Next.js/Firebase/Telegram-виджет используют inline-скрипты,
// и жёсткий script-src без проверки на живом сайте мог бы его сломать. Смотри нарушения в консоли браузера,
// затем перенеси нужные директивы в ENFORCED_CSP.
const REPORT_ONLY_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://telegram.org https://www.gstatic.com https://apis.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.google.com https://*.vercel-storage.com",
  "frame-src 'self' https://*.firebaseapp.com https://oauth.telegram.org https://accounts.google.com",
  "worker-src 'self' blob:",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": ENFORCED_CSP,
  "Content-Security-Policy-Report-Only": REPORT_ONLY_CSP,
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
