import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { TG_AUTH_URL, TG_COOKIE, getRedirectUri, getTelegramOidcConfig } from "@/lib/telegramOidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Начало входа через Telegram (OpenID Connect, Authorization Code + PKCE).
 * Генерирует state и PKCE-пару, кладёт их в короткоживущую httpOnly-куку и отправляет
 * пользователя на oauth.telegram.org. Опциональный ?ref= — реферальный код для новых аккаунтов.
 */
export async function GET(req: NextRequest) {
  const cfg = getTelegramOidcConfig();
  if (!cfg) {
    return NextResponse.redirect(new URL("/auth/login?tg_error=not-configured", req.nextUrl.origin));
  }

  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const ref = (req.nextUrl.searchParams.get("ref") ?? "").slice(0, 32);

  const url = new URL(TG_AUTH_URL);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", getRedirectUri(req.nextUrl.origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(url);
  res.cookies.set(TG_COOKIE, JSON.stringify({ state, verifier, ref }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax", // callback — переход верхнего уровня с oauth.telegram.org, Lax его пропускает
    path: "/api/auth/telegram-oidc",
    maxAge: 600,
  });
  return res;
}
