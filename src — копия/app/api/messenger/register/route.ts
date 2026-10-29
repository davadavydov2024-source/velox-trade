import { fail } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** Устарело: регистрация MiliGram идёт через Telegram-бота — см. /api/messenger/signup. */
export async function POST() {
  return fail("Регистрация идёт через Telegram-бота. Обнови страницу.", 410);
}
