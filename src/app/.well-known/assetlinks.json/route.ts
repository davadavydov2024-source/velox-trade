import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Digital Asset Links — подтверждает Android'у, что APK-приложение (обёртка TWA, собранная через
 * PWABuilder/Bubblewrap) имеет право открывать этот сайт БЕЗ адресной строки Chrome, на весь экран.
 * Без этого файла приложение работает, но сверху всегда висит панель с адресом сайта.
 *
 * Значения берутся из переменных окружения Vercel — их выдаёт PWABuilder при сборке APK:
 *   ANDROID_PACKAGE_NAME          — например com.veloxtrade.app
 *   ANDROID_SHA256_FINGERPRINTS   — отпечаток ключа подписи SHA-256 (можно несколько через запятую)
 * Пока переменные не заданы, отдаём пустой список — это валидный JSON и ничего не ломает.
 */
export async function GET() {
  const pkg = process.env.ANDROID_PACKAGE_NAME?.trim();
  const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  const body =
    pkg && fingerprints.length > 0
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints },
          },
        ]
      : [];

  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=300" } });
}
