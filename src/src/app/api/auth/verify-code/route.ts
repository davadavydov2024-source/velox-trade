import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();
    if (!email || !code) {
      return NextResponse.json({ error: "Укажи email и код" }, { status: 400 });
    }

    const auth = adminAuth();
    const db = adminDb();

    let uid: string;
    try {
      const user = await auth.getUserByEmail(String(email).trim().toLowerCase());
      uid = user.uid;
    } catch {
      return NextResponse.json({ error: "Неверный код" }, { status: 400 });
    }

    const ref = db.collection("loginCodes").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Код не запрошен или уже использован. Запроси новый." }, { status: 400 });
    }

    const data = snap.data() as { code: string; expiresAt: number; attempts: number };

    if (Date.now() > data.expiresAt) {
      await ref.delete();
      return NextResponse.json({ error: "Код истёк. Запроси новый." }, { status: 400 });
    }

    if (data.attempts >= 5) {
      await ref.delete();
      return NextResponse.json({ error: "Слишком много попыток. Запроси новый код." }, { status: 429 });
    }

    if (String(code).trim() !== data.code) {
      await ref.update({ attempts: data.attempts + 1 });
      return NextResponse.json({ error: "Неверный код" }, { status: 400 });
    }

    // Код верный — удаляем его (одноразовый) и выпускаем custom token для входа.
    await ref.delete();
    const token = await auth.createCustomToken(uid);

    return NextResponse.json({ token });
  } catch (err) {
    console.error("verify-code error:", err);
    return NextResponse.json({ error: "Не удалось проверить код. Попробуй позже." }, { status: 500 });
  }
}
