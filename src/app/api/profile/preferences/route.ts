import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/adminGuard";

export const runtime = "nodejs";

const NOTIFY_KEYS = ["email", "telegram", "loginAlerts"] as const;
const PRIVACY_KEYS = ["hideOnline"] as const;

/**
 * Сохраняет настройки уведомлений и приватности ТЕКУЩЕГО пользователя. Пишет сервер, а не браузер —
 * так не зависим от правил Firestore, а в профиль попадают только известные булевы поля.
 * Тело: { notifyPrefs?: { email?, telegram?, loginAlerts? }, privacy?: { hideOnline? } }.
 */
export async function POST(req: NextRequest) {
  try {
    const guard = await requireUser(req);
    if ("error" in guard) return guard.error;

    const body = (await req.json().catch(() => ({}))) as { notifyPrefs?: Record<string, unknown>; privacy?: Record<string, unknown> };
    const update: Record<string, boolean> = {};
    for (const k of NOTIFY_KEYS) if (typeof body.notifyPrefs?.[k] === "boolean") update[`notifyPrefs.${k}`] = body.notifyPrefs[k] as boolean;
    for (const k of PRIVACY_KEYS) if (typeof body.privacy?.[k] === "boolean") update[`privacy.${k}`] = body.privacy[k] as boolean;
    if (Object.keys(update).length === 0) return NextResponse.json({ error: "Нечего сохранять" }, { status: 400 });

    await adminDb().collection("users").doc(guard.uid).update(update);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("profile/preferences error:", err);
    return NextResponse.json({ error: "Не удалось сохранить настройки" }, { status: 500 });
  }
}
