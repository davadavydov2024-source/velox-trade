import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { TelegramContest, TelegramContestEntry } from "@/types";

export const runtime = "nodejs";

function isAdminUid(uid: string): boolean {
  const list = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

/** Отдаёт все конкурсы (активные и завершённые) вместе со списком участников каждого — для
 * /admin/contests, где админ вручную решает, когда подводить итоги (см. api/admin/contests/finish). */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded || !isAdminUid(decoded.uid)) return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });

    const db = adminDb();
    const contestsSnap = await db.collection("telegramContests").orderBy("createdAt", "desc").get();
    const contests = contestsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as TelegramContest);

    const withEntries = await Promise.all(
      contests.map(async (contest) => {
        const entriesSnap = await db.collection("telegramContestEntries").where("contestId", "==", contest.id).get();
        const entries = entriesSnap.docs.map((d) => d.data() as TelegramContestEntry).sort((a, b) => a.joinedAt - b.joinedAt);
        return { ...contest, entries };
      })
    );

    return NextResponse.json({ contests: withEntries });
  } catch (err) {
    console.error("admin/contests GET error:", err);
    return NextResponse.json({ error: "Не удалось загрузить конкурсы" }, { status: 500 });
  }
}
