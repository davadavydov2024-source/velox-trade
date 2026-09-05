import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
import { finishContest } from "@/lib/telegramContests";

export const runtime = "nodejs";

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

/** Ручное завершение конкурса с сайта (/admin/contests) — победители выбираются случайно из всех
 * участников (см. lib/telegramContests.ts → finishContest). */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded || !isAdminUid(decoded.uid)) return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });

    const { contestId } = await req.json();
    if (typeof contestId !== "string" || !contestId) return NextResponse.json({ error: "Не указан конкурс" }, { status: 400 });

    await finishContest(contestId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin/contests/finish error:", err);
    return NextResponse.json({ error: "Не удалось завершить конкурс" }, { status: 500 });
  }
}
