import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Для страницы регистрации: бот уже открыт и код отправлен в Telegram? (чтобы показать поле ввода). */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Не указан токен" }, { status: 400 });
  const snap = await adminDb().collection("tgVerifyRequests").doc(token).get();
  if (!snap.exists) return NextResponse.json({ sent: false, notFound: true });
  const status = (snap.data() as { status: string }).status;
  return NextResponse.json({ sent: status === "sent" || status === "verified" });
}
