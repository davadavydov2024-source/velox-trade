import { NextRequest, NextResponse } from "next/server";
import { TG_COOKIE, TG_TOKEN_URL, getRedirectUri, getSiteOrigin, getTelegramOidcConfig, verifyTelegramIdToken } from "@/lib/telegramOidc";
import { loginWithTelegramIdentity } from "@/lib/telegramLogin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(req: NextRequest, code: string) {
  const res = NextResponse.redirect(new URL(`/auth/login?tg_error=${encodeURIComponent(code)}`, getSiteOrigin(req.nextUrl.origin)));
  res.cookies.delete(TG_COOKIE);
  return res;
}

/**
 * Возврат из Telegram: проверяем state, меняем code на токены (Basic-авторизация + PKCE),
 * проверяем подпись id_token, находим/создаём аккаунт и отправляем на /auth/telegram-finish
 * с custom-токеном Firebase в ФРАГМЕНТЕ адреса (#...) — он не уходит на серверы и в логи.
 */
export async function GET(req: NextRequest) {
  try {
    const cfg = getTelegramOidcConfig();
    if (!cfg) return fail(req, "not-configured");

    const params = req.nextUrl.searchParams;
    if (params.get("error")) return fail(req, "denied");
    const code = params.get("code");
    const state = params.get("state");

    const raw = req.cookies.get(TG_COOKIE)?.value;
    if (!raw || !code || !state) return fail(req, "session-expired");
    let saved: { state: string; verifier: string; ref?: string };
    try {
      saved = JSON.parse(raw);
    } catch {
      return fail(req, "session-expired");
    }
    if (saved.state !== state) return fail(req, "state-mismatch");

    const tokenRes = await fetch(TG_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: getRedirectUri(req.nextUrl.origin),
        client_id: cfg.clientId,
        code_verifier: saved.verifier,
      }),
    });
    if (!tokenRes.ok) {
      console.error("telegram-oidc token error:", tokenRes.status, (await tokenRes.text()).slice(0, 300));
      return fail(req, "token-exchange");
    }
    const tokens = (await tokenRes.json()) as { id_token?: string };
    if (!tokens.id_token) return fail(req, "no-id-token");

    const claims = await verifyTelegramIdToken(tokens.id_token, cfg.clientId);
    const telegramId = claims.id ?? claims.sub;
    if (!telegramId) return fail(req, "no-user");

    const { token, isNew } = await loginWithTelegramIdentity({
      id: telegramId,
      name: claims.name,
      username: claims.preferred_username ?? null,
      photoUrl: claims.picture ?? null,
    });

    const hash = new URLSearchParams({ token });
    if (isNew && saved.ref) hash.set("ref", saved.ref);
    if (isNew) hash.set("new", "1");

    const res = NextResponse.redirect(new URL(`/auth/telegram-finish#${hash.toString()}`, getSiteOrigin(req.nextUrl.origin)));
    res.cookies.delete(TG_COOKIE);
    return res;
  } catch (err: any) {
    console.error("telegram-oidc callback error:", err?.message || err);
    return fail(req, "failed");
  }
}
