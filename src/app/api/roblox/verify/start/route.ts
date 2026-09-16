import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Шаг 1 привязки Roblox-аккаунта: находим ник через ПУБЛИЧНЫЙ API Roblox (без пароля, без
 * .ROBLOSECURITY — см. развёрнутый комментарий в /api/roblox/lookup) и выдаём одноразовый код,
 * который пользователь должен на время вставить в описание своего профиля на Roblox. Подтверждение
 * происходит в /api/roblox/verify/confirm — оно тоже читает только публичные данные профиля.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });

    const { username } = await req.json();
    const trimmed = typeof username === "string" ? username.trim() : "";
    if (!trimmed || trimmed.length > 30) return NextResponse.json({ error: "Укажи корректный Roblox-ник" }, { status: 400 });

    const lookupRes = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [trimmed], excludeBannedUsers: true }),
    });
    if (!lookupRes.ok) return NextResponse.json({ error: "Roblox временно недоступен, попробуй позже" }, { status: 502 });
    const lookupData = await lookupRes.json();
    const match = lookupData?.data?.[0];
    if (!match?.id) return NextResponse.json({ error: "Игрок с таким ником не найден" }, { status: 404 });

    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${match.id}&size=150x150&format=Png&isCircular=false`
    );
    const thumbData = thumbRes.ok ? await thumbRes.json() : null;
    const avatarUrl: string | null = thumbData?.data?.[0]?.imageUrl ?? null;

    // Одна попытка перезаписывает предыдущую (на случай если пользователь ошибся ником).
    // ВАЖНО: код НЕ должен содержать слов вроде "verify"/"код"/"подтверди" — фильтр Roblox активно
    // блюрит/скрывает такие фразы в описании профиля именно потому, что "verify your account" —
    // классическая формулировка мошенников. Поэтому код — просто нейтральный набор символов без
    // единого узнаваемого слова, не похожий ни на ссылку, ни на просьбу что-то подтвердить.
    const code = Math.random().toString(36).slice(2, 10);

    await adminDb().collection("robloxVerifications").doc(decoded.uid).set({
      code,
      robloxUserId: match.id,
      robloxUsername: match.name,
      robloxDisplayName: match.displayName ?? match.name,
      avatarUrl,
      createdAt: Date.now(),
    });

    return NextResponse.json({
      code,
      robloxUserId: match.id,
      robloxUsername: match.name,
      robloxDisplayName: match.displayName ?? match.name,
      avatarUrl,
      profileUrl: `https://www.roblox.com/users/${match.id}/profile`,
    });
  } catch (err) {
    console.error("roblox/verify/start error:", err);
    return NextResponse.json({ error: "Не удалось начать проверку" }, { status: 500 });
  }
}
