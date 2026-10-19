import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * ОТКЛЮЧЕНО из соображений безопасности. Раньше роут принимал любой email и возвращал в ответе
 * готовую ссылку сброса пароля — любой мог получить ссылку для чужого аккаунта и захватить его.
 * Сброс пароля делается штатным Firebase sendPasswordResetEmail (ссылка уходит только владельцу почты).
 */
export async function POST() {
  return NextResponse.json({ error: "Gone" }, { status: 410 });
}
