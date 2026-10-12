import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/** Шаг 2: человек вводит на сайте код, который бот прислал в Telegram. */
export async function POST(req: NextRequest) {
  try {
    const { token, code } = await req.json();
    if (typeof token !== "string" || typeof code !== "string" || !token || !code.trim()) {
      return NextResponse.json({ error: "Введи код" }, { status: 400 });
    }
    const ref = adminDb().collection("tgVerifyRequests").doc(token);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Заявка не найдена — начни регистрацию заново" }, { status: 404 });
    const data = snap.data() as { code: string; status: string; attempts: number; createdAt: number };

    if (data.status === "pending") {
      return NextResponse.json({ error: "Сначала открой бота и нажми Start — код придёт в Telegram" }, { status: 400 });
    }
    if (Date.now() - data.createdAt > CODE_TTL_MS) return NextResponse.json({ error: "Код устарел — начни заново" }, { status: 410 });
    if (data.attempts >= MAX_ATTEMPTS) return NextResponse.json({ error: "Слишком много попыток — начни заново" }, { status: 429 });
    if (data.code !== code.trim()) {
      await ref.update({ attempts: data.attempts + 1 });
      return NextResponse.json({ error: "Неверный код" }, { status: 400 });
    }
    await ref.update({ status: "verified", verifiedAt: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("tg-verify/confirm error:", err);
    return NextResponse.json({ error: "Не удалось проверить код" }, { status: 500 });
  }
}
