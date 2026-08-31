import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Serverless-функция переиспользуется между вызовами, пока Vercel не пересоздаст инстанс — этот
// момент (первый вызов после холодного старта) достаточно близок к моменту деплоя, чтобы
// показать администратору примерное "когда это реально обновилось на сервере", без точного API
// времени сборки от Vercel.
const coldStartAt = Date.now();

/**
 * Vercel сам прокидывает эти переменные в окружение каждой сборки — ничего дополнительно
 * настраивать не нужно (см. https://vercel.com/docs/environment-variables/system-environment-variables).
 * Читаем их именно на сервере (а не через NEXT_PUBLIC_*), потому что для этого не нужно менять
 * next.config.js — системные переменные и так видны в любом серверном коде.
 */
export async function GET() {
  return NextResponse.json({
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown",
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "unknown",
    env: process.env.VERCEL_ENV ?? "development",
    coldStartAt,
  });
}
