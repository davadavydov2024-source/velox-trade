import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    if (!code) return NextResponse.json({ error: "Код обязателен" }, { status: 400 });

    const ref = adminDb().collection("vkLoginTokens").doc(code);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Ссылка для входа устарела. Попробуй войти через VK ещё раз." }, { status: 400 });
    }

    const data = snap.data() as { token: string; expiresAt: number };
    await ref.delete(); // одноразовый код

    if (Date.now() > data.expiresAt) {
      return NextResponse.json({ error: "Ссылка для входа устарела. Попробуй войти через VK ещё раз." }, { status: 400 });
    }

    return NextResponse.json({ token: data.token });
  } catch (err) {
    console.error("vk-finish error:", err);
    return NextResponse.json({ error: "Не удалось завершить вход" }, { status: 500 });
  }
}
