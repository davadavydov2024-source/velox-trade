import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { adminListBots, isBotUid } from "@/lib/messenger/bots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — все боты конструктора и их создатели (только для админов сайта).
 * GET ?uid=bot_… — один бот и его создатель (для профиля бота в чате).
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const uid = (req.nextUrl.searchParams.get("uid") ?? "").trim();
  if (uid && !isBotUid(uid)) return NextResponse.json({ error: "Это не бот" }, { status: 400 });
  try {
    return NextResponse.json({ bots: await adminListBots(uid || undefined) });
  } catch (e) {
    console.error("admin bots error:", e);
    return NextResponse.json({ error: "Не удалось загрузить ботов" }, { status: 500 });
  }
}
