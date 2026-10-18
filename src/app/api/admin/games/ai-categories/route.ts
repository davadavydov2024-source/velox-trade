import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { isAiCategoriesConfigured, suggestGameCategories } from "@/lib/aiCategories";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

/**
 * ИИ подбирает категории (и черновик правил модерации) для игры. Только для админов.
 * Тело: { name: string, slug?: string, existing?: string[] }.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    if (!isAdminUid(decoded.uid)) return NextResponse.json({ error: "Доступ только для администраторов" }, { status: 403 });

    if (!isAiCategoriesConfigured()) {
      return NextResponse.json({ error: "ИИ не настроен: добавь GEMINI_API_KEY (бесплатно) или ANTHROPIC_API_KEY в Vercel" }, { status: 503 });
    }

    const { name, slug, existing } = (await req.json().catch(() => ({}))) as { name?: string; slug?: string; existing?: unknown };
    const gameName = typeof name === "string" ? name.trim().slice(0, 80) : "";
    if (!gameName) return NextResponse.json({ error: "Сначала укажи название игры" }, { status: 400 });

    const existingList = Array.isArray(existing) ? existing.filter((x): x is string => typeof x === "string").slice(0, 30) : [];
    const gamesSnap = await adminDb().collection("games").get();
    const otherGames = gamesSnap.docs.map((d) => String(d.data().name ?? "")).filter((n) => n && n.toLowerCase() !== gameName.toLowerCase());

    const suggestion = await suggestGameCategories({
      gameName,
      slug: typeof slug === "string" ? slug.slice(0, 60) : undefined,
      existing: existingList,
      otherGames,
    });
    if (!suggestion) return NextResponse.json({ error: "ИИ не смог подобрать категории — добавь вручную или попробуй ещё раз" }, { status: 502 });
    return NextResponse.json(suggestion);
  } catch (err) {
    console.error("ai-categories error:", err);
    return NextResponse.json({ error: "Не удалось подобрать категории" }, { status: 500 });
  }
}
