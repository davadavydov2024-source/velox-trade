import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit, ipKey } from "@/lib/rateLimit";
import { safeEqual } from "@/lib/secureRandom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/** Шаг 2: пользователь вводит код из письма. Попытки считаются атомарно (транзакция). */
export async function POST(req: NextRequest) {
  try {
    if (!(await rateLimit(ipKey(req, "email_confirm"), 30, 15 * 60_000))) {
      return NextResponse.json({ error: "Слишком много попыток. Подожди немного." }, { status: 429 });
    }
    const { email, code } = await req.json();
    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
    const enteredCode = typeof code === "string" ? code.trim() : "";
    if (!normalized || !enteredCode) return NextResponse.json({ error: "Заполни email и код" }, { status: 400 });

    const db = adminDb();
    const ref = db.collection("emailVerificationCodes").doc(normalized);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return "missing" as const;
      const data = snap.data() as { code: string; createdAt: number; attempts: number };
      if (Date.now() - data.createdAt > CODE_TTL_MS) return "expired" as const;
      if (data.attempts >= MAX_ATTEMPTS) return "locked" as const;
      if (!safeEqual(data.code, enteredCode)) { tx.update(ref, { attempts: data.attempts + 1 }); return "wrong" as const; }
      tx.update(ref, { verified: true, verifiedAt: Date.now() });
      return "ok" as const;
    });

    if (result === "missing") return NextResponse.json({ error: "Сначала запроси код" }, { status: 404 });
    if (result === "expired") return NextResponse.json({ error: "Код устарел, запроси новый" }, { status: 410 });
    if (result === "locked") return NextResponse.json({ error: "Слишком много попыток, запроси новый код" }, { status: 429 });
    if (result === "wrong") return NextResponse.json({ error: "Неверный код" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("auth/email-code/confirm error:", err);
    return NextResponse.json({ error: "Не удалось проверить код" }, { status: 500 });
  }
}
