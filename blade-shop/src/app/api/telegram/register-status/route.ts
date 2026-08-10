import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Не указан код" }, { status: 400 });
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
