import { createPublicKey, verify as cryptoVerify } from "crypto";

export const TG_AUTH_URL = "https://oauth.telegram.org/auth";
export const TG_TOKEN_URL = "https://oauth.telegram.org/token";
export const TG_JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json";
export const TG_ISSUER = "https://oauth.telegram.org";
export const TG_COOKIE = "tg_oidc";

export function getTelegramOidcConfig() {
  const clientId = process.env.TELEGRAM_OIDC_CLIENT_ID;
  const clientSecret = process.env.TELEGRAM_OIDC_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Адрес сайта, который зарегистрирован в BotFather (Login Widget → Allowed URLs). */
export function getSiteOrigin(fallbackOrigin: string): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || fallbackOrigin).replace(/\/+$/, "");
}

export function getRedirectUri(fallbackOrigin: string): string {
  return `${getSiteOrigin(fallbackOrigin)}/api/auth/telegram-oidc/callback`;
}

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  [k: string]: unknown;
}

let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;

async function getJwks(force = false): Promise<Jwk[]> {
  if (!force && jwksCache && Date.now() - jwksCache.fetchedAt < 60 * 60 * 1000) return jwksCache.keys;
  const res = await fetch(TG_JWKS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("jwks-fetch-failed");
  const data = (await res.json()) as { keys: Jwk[] };
  jwksCache = { keys: data.keys ?? [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

export interface TelegramIdClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  iat?: number;
  id?: number | string;
  name?: string;
  preferred_username?: string;
  picture?: string;
}

function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Проверяет id_token от Telegram по официальной инструкции: подпись по ключам JWKS, iss, aud
 * (наш Client ID) и срок действия. Без этой проверки можно было бы подделать токен и войти под
 * чужим Telegram. Поддерживаются RS256 (по умолчанию в BotFather) и ES256.
 */
export async function verifyTelegramIdToken(idToken: string, clientId: string): Promise<TelegramIdClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("bad-token");
  const header = JSON.parse(b64urlToBuffer(parts[0]).toString("utf8")) as { alg: string; kid?: string };
  const claims = JSON.parse(b64urlToBuffer(parts[1]).toString("utf8")) as TelegramIdClaims;
  const signature = b64urlToBuffer(parts[2]);
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);

  if (header.alg !== "RS256" && header.alg !== "ES256") throw new Error(`unsupported-alg:${header.alg}`);

  let keys = await getJwks();
  let jwk = keys.find((k) => !header.kid || k.kid === header.kid);
  if (!jwk) {
    keys = await getJwks(true); // ключи могли смениться
    jwk = keys.find((k) => !header.kid || k.kid === header.kid);
  }
  if (!jwk) throw new Error("key-not-found");

  const publicKey = createPublicKey({ key: jwk as any, format: "jwk" });
  const ok =
    header.alg === "RS256"
      ? cryptoVerify("RSA-SHA256", data, publicKey, signature)
      : cryptoVerify("sha256", data, { key: publicKey, dsaEncoding: "ieee-p1363" }, signature);
  if (!ok) throw new Error("bad-signature");

  const audOk = Array.isArray(claims.aud) ? claims.aud.includes(clientId) : String(claims.aud) === String(clientId);
  if (claims.iss !== TG_ISSUER || !audOk) throw new Error("bad-claims");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("expired");
  return claims;
}
