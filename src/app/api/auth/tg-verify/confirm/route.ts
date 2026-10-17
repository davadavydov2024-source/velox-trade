import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit, ipKey } from "@/lib/rateLimit";
import { safeEqual } from "@/lib/secureRandom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/** Шаг 2: человек вводит на сайте код, который бот прислал в Telegram. Попытки считаются атомарно. */
export async function POST(req: NextRequest) {
  try {
    if (!(await rateLimit(ipKey(req, "tg_confirm"), 30, 15 * 60_000))) {
      return NextResponse.json({ error: "Слишком много попыток. Подожди немного." }, { status: 429 });
    }
    const { token, code } = await req.json();
    if (typeof token !== "string" || typeof code !== "string" || !token || !code.trim()) {
      return NextResponse.json({ error: "Введи код" }, { status: 400 });
    }
    const db = adminDb();
    const ref = db.collection("tgVerifyRequests").doc(token);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return "missing" as const;
      const data = snap.data() as { code: string; status: string; attempts: number; createdAt: number };
      if (data.status === "pending") return "pending" as const;
      if (Date.now() - data.createdAt > CODE_TTL_MS) return "expired" as const;
      if (data.attempts >= MAX_ATTEMPTS) return "locked" as const;
      if (!safeEqual(data.code, code.trim())) { tx.update(ref, { attempts: data.attempts + 1 }); return "wrong" as const; }
      tx.update(ref, { status: "verified", verifiedAt: Date.now() });
      return "ok" as const;
    });

    if (result === "missing") return NextResponse.json({ error: "Заявка не найдена — начни регистрацию заново" }, { status: 404 });
    if (result === "pending") return NextResponse.json({ error: "Сначала открой бота и нажми Start — код придёт в Telegram" }, { status: 400 });
    if (result === "expired") return NextResponse.json({ error: "Код устарел — начни заново" }, { status: 410 });
    if (result === "locked") return NextResponse.json({ error: "Слишком много попыток — начни заново" }, { status: 429 });
    if (result === "wrong") return NextResponse.json({ error: "Неверный код" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("tg-verify/confirm error:", err);
    return NextResponse.json({ error: "Не удалось проверить код" }, { status: 500 });
  }
}
