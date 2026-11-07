import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { createLinkRequest, fail, requireFirebaseUid, telegramConflict } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — привязан ли Telegram к аккаунту: { linked, conflict? }. Если этот Telegram уже занят другим аккаунтом MiliGram — привязку снимаем. */
export async function GET(req: NextRequest) {
  const uid = await requireFirebaseUid(req);
  if (!uid) return fail("Нужно войти в аккаунт", 401);
  const ref = adminDb().collection("telegramLinks").doc(uid);
  const link = (await ref.get()).data() as { chatId?: number; telegramUsername?: string | null } | undefined;
  if (!link?.chatId) return NextResponse.json({ linked: false });
  if (await telegramConflict(uid, link.chatId)) {
    await ref.delete().catch(() => {});
    return NextResponse.json({ linked: false, conflict: true });
  }
  return NextResponse.json({ linked: true, username: link.telegramUsername ?? null });
}

/** POST — ссылка на бота, чтобы привязать Telegram позже (почта + Telegram). Дальше опрашивать GET. */
export async function POST(req: NextRequest) {
  const uid = await requireFirebaseUid(req);
  if (!uid) return fail("Нужно войти в аккаунт", 401);
  if (!(await rateLimit(`msgr_tglink_${uid}`, 12, 60 * 60_000))) return fail("Слишком много попыток, попробуй позже", 429);
  const { code, botUrl } = await createLinkRequest(uid);
  return NextResponse.json({ code, botUrl });
}
