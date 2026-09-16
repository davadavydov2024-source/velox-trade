import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Показ предметов Roblox-аккаунта — тоже только публичные данные, без единого запроса, требующего
 * логина. Сначала пробуем публичный список коллекционных предметов (inventory.roblox.com) — с
 * 2024 года Roblox по умолчанию делает инвентарь приватным для новых аккаунтов, так что этот
 * запрос часто будет пустым/403, если владелец явно не включил публичный инвентарь в настройках
 * приватности. Поэтому дополнительно всегда подтягиваем то, что сейчас надето на аватаре
 * (avatar.roblox.com) — это видно всем в игре и никогда не скрывается настройками приватности.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId || !/^\d+$/.test(userId)) return NextResponse.json({ error: "Некорректный userId" }, { status: 400 });

  let collectibles: { id: number; name: string; imageUrl: string | null }[] = [];
  let collectiblesPrivate = false;

  try {
    const res = await fetch(`https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?sortOrder=Desc&limit=50`);
    if (res.status === 403) {
      collectiblesPrivate = true;
    } else if (res.ok) {
      const data = await res.json();
      const items = (data?.data ?? []) as { assetId: number; name: string }[];
      if (items.length > 0) {
        const ids = items.map((i) => i.assetId).join(",");
        const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${ids}&size=150x150&format=Png`);
        const thumbData = thumbRes.ok ? await thumbRes.json() : null;
        const thumbMap = new Map<number, string>((thumbData?.data ?? []).map((t: any) => [t.targetId, t.imageUrl]));
        collectibles = items.map((i) => ({ id: i.assetId, name: i.name, imageUrl: thumbMap.get(i.assetId) ?? null }));
      }
    }
  } catch (err) {
    console.error("roblox/inventory collectibles error:", err);
  }

  let worn: { id: number; name: string; imageUrl: string | null }[] = [];
  try {
    const avatarRes = await fetch(`https://avatar.roblox.com/v1/users/${userId}/avatar`);
    if (avatarRes.ok) {
      const avatar = await avatarRes.json();
      const assets = (avatar?.assets ?? []) as { id: number; name: string }[];
      if (assets.length > 0) {
        const ids = assets.map((a) => a.id).join(",");
        const thumbRes = await fetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${ids}&size=150x150&format=Png`);
        const thumbData = thumbRes.ok ? await thumbRes.json() : null;
        const thumbMap = new Map<number, string>((thumbData?.data ?? []).map((t: any) => [t.targetId, t.imageUrl]));
        worn = assets.map((a) => ({ id: a.id, name: a.name, imageUrl: thumbMap.get(a.id) ?? null }));
      }
    }
  } catch (err) {
    console.error("roblox/inventory avatar error:", err);
  }

  return NextResponse.json({ collectibles, collectiblesPrivate, worn });
}
