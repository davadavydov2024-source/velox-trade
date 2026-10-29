/**
 * После того как Captcha.tsx вызвал onVerified(passToken), компонент-владелец сохраняет токен и
 * передаёт его сюда перед отправкой важного запроса. Заголовок для сервера — см.
 * lib/firebaseAdmin.ts → verifyCaptchaToken.
 */
export function captchaHeader(passToken: string | null): Record<string, string> {
  return passToken ? { "X-Captcha-Token": passToken } : {};
}
