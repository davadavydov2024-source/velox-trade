import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Недействительный токен" }, { status: 401 });

    await adminDb().collection("telegramLinks").doc(decoded.uid).delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("telegram/unlink error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
