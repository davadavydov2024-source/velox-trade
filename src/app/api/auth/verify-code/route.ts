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

    // Лимит считается по АККАУНТУ (uid), а не по IP: заголовок X-Forwarded-For подделывается клиентом,
    // поэтому в проверке вообще не участвует. Всё — в одной транзакции, иначе параллельные запросы
    // читают один и тот же счётчик и получают неограниченное число попыток.
    const ref = db.collection("loginCodes").doc(uid);
    const throttleRef = db.collection("loginThrottle").doc(uid);
    const MAX_FAILS = 10; // неудач на аккаунт за окно, после чего вход по коду блокируется
    const WINDOW_MS = 15 * 60 * 1000;

    const result = await db.runTransaction(async (tx) => {
      const [snap, thr] = await Promise.all([tx.get(ref), tx.get(throttleRef)]);
      const now = Date.now();
      const t = (thr.exists ? thr.data() : null) as { fails: number; windowStart: number } | null;
      const fails = t && now - t.windowStart < WINDOW_MS ? t.fails : 0;
      const windowStart = t && now - t.windowStart < WINDOW_MS ? t.windowStart : now;
      if (fails >= MAX_FAILS) return "locked" as const;
      if (!snap.exists) return "nocode" as const;
      const data = snap.data() as { code: string; expiresAt: number; attempts: number };
      if (now > data.expiresAt) { tx.delete(ref); return "expired" as const; }
      if (data.attempts >= 5) { tx.delete(ref); return "toomany" as const; }
      if (String(code).trim() !== data.code) {
        tx.update(ref, { attempts: data.attempts + 1 });
        tx.set(throttleRef, { fails: fails + 1, windowStart });
        return "wrong" as const;
      }
      tx.delete(ref);
      tx.delete(throttleRef);
      return "ok" as const;
    });

    if (result === "locked") return NextResponse.json({ error: "Слишком много неудачных попыток. Попробуй через 15 минут." }, { status: 429 });
    if (result === "nocode") return NextResponse.json({ error: "Код не запрошен или уже использован. Запроси новый." }, { status: 400 });
    if (result === "expired") return NextResponse.json({ error: "Код истёк. Запроси новый." }, { status: 400 });
    if (result === "toomany") return NextResponse.json({ error: "Слишком много попыток. Запроси новый код." }, { status: 429 });
    if (result === "wrong") return NextResponse.json({ error: "Неверный код" }, { status: 400 });

    const token = await auth.createCustomToken(uid);

    return NextResponse.json({ token });
  } catch (err) {
    console.error("verify-code error:", err);
    return NextResponse.json({ error: "Не удалось проверить код. Попробуй позже." }, { status: 500 });
  }
}
