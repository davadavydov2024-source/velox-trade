import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit, ipKey } from "@/lib/apiRateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code || !/^[A-Za-z0-9_-]{4,64}$/.test(code)) {
    return NextResponse.json({ error: "Не указан код" }, { status: 400 });
  }
  // страница опрашивает раз в 3 секунды; лимит с запасом, но перебор кодов по HTTP не пройдёт
  if (!(await rateLimit(ipKey(req, "tg_reg_status"), 120, 5 * 60_000))) {
    return NextResponse.json({ error: "Слишком часто" }, { status: 429 });
  }

  try {
    const db = adminDb();
    const snap = await db.collection("telegramRegisterRequests").doc(code).get();
    if (!snap.exists) {
      return NextResponse.json({ done: false, notFound: true });
    }
    const data = snap.data() as { status: string };
    return NextResponse.json({ done: data.status === "done" });
  } catch (err) {
    console.error("register-status error:", err);
    return NextResponse.json({ error: "Не удалось проверить статус" }, { status: 500 });
  }
}
