import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Приложение спрашивает оформление других пользователей MiliGram по их Telegram-id:
 * POST { ids: number[] } (до 30) + Authorization: Bearer <токен устройства>.
 * Отдаёт только публичное оформление (бейдж, градиент, обводка, баннер); забаненные не отдаются.
 */
export async function POST(req: NextRequest) {
  const h = req.headers.get("authorization");
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Нет токена" }, { status: 401 });

  const db = adminDb();
  const hash = createHash("sha256").update(token).digest("hex");
  const device = (await db.collection("miligramDevices").doc(hash).get()).data() as { uid: string } | undefined;
  if (!device) return NextResponse.json({ error: "Токен недействителен" }, { status: 401 });

  const me = (await db.collection("miligramProfiles").doc(device.uid).get()).data();
  if (me?.banned) return NextResponse.json({ error: "Доступ закрыт" }, { status: 403 });
  if (!me?.lastSeenAt || Date.now() - me.lastSeenAt > 10 * 60 * 1000) {
    db.collection("miligramProfiles").doc(device.uid).set({ lastSeenAt: Date.now() }, { merge: true }).catch(() => {});
  }

  const body = await req.json().catch(() => ({}));
  const ids: number[] = Array.isArray(body.ids) ? Array.from(new Set(body.ids.filter((n: unknown) => Number.isSafeInteger(n)))).slice(0, 30) as number[] : [];
  if (ids.length === 0) return NextResponse.json({ profiles: {} });

  const snap = await db.collection("miligramProfiles").where("tgUserId", "in", ids).get();
  const profiles: Record<string, unknown> = {};
  snap.docs.forEach((d) => {
    const p = d.data();
    if (p.banned) return;
    profiles[String(p.tgUserId)] = {
      badge: p.badge ?? null,
      gradientFrom: p.gradientFrom ?? null,
      gradientTo: p.gradientTo ?? null,
      borderColor: p.borderColor ?? null,
      bannerURL: p.bannerURL ?? null,
    };
  });
  return NextResponse.json({ profiles });
}
