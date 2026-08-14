import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Ищет игрока Roblox по нику и возвращает его аватарку — чтобы продавец/админ мог визуально
 * убедиться, что ник введён верно, прежде чем передавать предмет. Используются ТОЛЬКО публичные
 * эндпоинты Roblox (users.roblox.com, thumbnails.roblox.com) — без логина, без пароля, без куки.
 * Это ровно то же самое, что видно на обычной странице профиля roblox.com/users/<id>/profile —
 * никакого доступа к самому аккаунту это не даёт.
 */
export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username")?.trim();
  if (!username) return NextResponse.json({ error: "Не указан ник" }, { status: 400 });
  if (username.length > 30) return NextResponse.json({ found: false });

  try {
    const lookupRes = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
      // Публичный запрос, кэшируем ненадолго — снижает риск упереться в рейт-лимиты Roblox
      // при активном использовании формы (debounce на клиенте плюс это).
      next: { revalidate: 60 },
    });

    if (!lookupRes.ok) return NextResponse.json({ found: false });
    const lookupData = await lookupRes.json();
    const match = lookupData?.data?.[0];
    if (!match?.id) return NextResponse.json({ found: false });

    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${match.id}&size=150x150&format=Png&isCircular=false`,
      { next: { revalidate: 300 } }
    );
    const thumbData = thumbRes.ok ? await thumbRes.json() : null;
    const avatarUrl: string | null = thumbData?.data?.[0]?.imageUrl ?? null;

    return NextResponse.json({
      found: true,
      userId: match.id,
      username: match.name,
      displayName: match.displayName,
      avatarUrl,
      profileUrl: `https://www.roblox.com/users/${match.id}/profile`,
    });
  } catch (err) {
    console.error("roblox/lookup error:", err);
    // Roblox недоступен/лимит — не блокируем пользователя, просто без превью.
    return NextResponse.json({ found: false });
  }
}
