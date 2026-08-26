import { NextRequest } from "next/server";

/**
 * На Vercel (и большинстве прокси/CDN) реальный IP клиента приходит в x-forwarded-for — это
 * список через запятую, если запрос прошёл через несколько прокси, первый адрес — самый
 * "внешний", то есть настоящий клиент. x-real-ip — запасной вариант для окружений, которые его
 * не проставляют. req.ip в некоторых рантаймах Next.js бывает undefined на Vercel Edge, поэтому
 * не полагаемся на него как на единственный источник.
 */
export function getClientIp(req: NextRequest | Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
