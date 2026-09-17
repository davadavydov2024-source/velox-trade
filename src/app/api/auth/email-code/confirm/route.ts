import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/** Шаг 2: пользователь вводит код из письма. Помечаем doc verified:true — сам аккаунт в Firebase
 * Auth ещё не существует на этом этапе (его создаёт клиент чуть позже через createUserWithEmail...),
 * финальная сверка происходит в /api/auth/email-code/finalize уже после его создания. */
export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();
    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
    const enteredCode = typeof code === "string" ? code.trim() : "";
    if (!normalized || !enteredCode) return NextResponse.json({ error: "Заполни email и код" }, { status: 400 });

    const db = adminDb();
    const ref = db.collection("emailVerificationCodes").doc(normalized);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Сначала запроси код" }, { status: 404 });

    const data = snap.data() as { code: string; createdAt: number; attempts: number; verified: boolean };
    if (Date.now() - data.createdAt > CODE_TTL_MS) {
      return NextResponse.json({ error: "Код устарел, запроси новый" }, { status: 410 });
    }
    if (data.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json({ error: "Слишком много попыток, запроси новый код" }, { status: 429 });
    }

    if (data.code !== enteredCode) {
      await ref.update({ attempts: data.attempts + 1 });
      return NextResponse.json({ error: "Неверный код" }, { status: 400 });
    }

    await ref.update({ verified: true, verifiedAt: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("auth/email-code/confirm error:", err);
    return NextResponse.json({ error: "Не удалось проверить код" }, { status: 500 });
  }
}
