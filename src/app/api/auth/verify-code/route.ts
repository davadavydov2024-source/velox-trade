import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { rateLimit, ipKey } from "@/lib/rateLimit";
import { safeEqual } from "@/lib/secureRandom";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!(await rateLimit(ipKey(req, "verify_code"), 20, 15 * 60_000))) {
      return NextResponse.json({ error: "Слишком много попыток. Подожди немного." }, { status: 429 });
    }
    const { email, code } = await req.json();
    if (!email || !code) return NextResponse.json({ error: "Укажи email и код" }, { status: 400 });

    const auth = adminAuth();
    const db = adminDb();

    let uid: string;
    try {
      uid = (await auth.getUserByEmail(String(email).trim().toLowerCase())).uid;
    } catch {
      return NextResponse.json({ error: "Неверный код" }, { status: 400 });
    }

    const ref = db.collection("loginCodes").doc(uid);
    // Счётчик попыток и проверка — в одной транзакции: раньше параллельные запросы читали attempts=0
    // одновременно и могли перебирать 6-значный код быстрее, чем срабатывал лимит в 5 попыток.
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return "missing" as const;
      const data = snap.data() as { code: string; expiresAt: number; attempts: number };
      if (Date.now() > data.expiresAt) { tx.delete(ref); return "expired" as const; }
      if (data.attempts >= 5) { tx.delete(ref); return "locked" as const; }
      if (!safeEqual(String(code).trim(), data.code)) { tx.update(ref, { attempts: data.attempts + 1 }); return "wrong" as const; }
      tx.delete(ref);
      return "ok" as const;
    });

    if (result === "missing") return NextResponse.json({ error: "Код не запрошен или уже использован. Запроси новый." }, { status: 400 });
    if (result === "expired") return NextResponse.json({ error: "Код истёк. Запроси новый." }, { status: 400 });
    if (result === "locked") return NextResponse.json({ error: "Слишком много попыток. Запроси новый код." }, { status: 429 });
    if (result === "wrong") return NextResponse.json({ error: "Неверный код" }, { status: 400 });

    return NextResponse.json({ token: await auth.createCustomToken(uid) });
  } catch (err) {
    console.error("verify-code error:", err);
    return NextResponse.json({ error: "Не удалось проверить код. Попробуй позже." }, { status: 500 });
  }
}
