import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { sendTelegramMessage } from "@/lib/telegramBot";
import { DEFAULT_FEATURE_FLAGS } from "@/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const newUid = decoded.uid;

    const { code } = await req.json();
    if (typeof code !== "string" || !code) {
      return NextResponse.json({ error: "Код обязателен" }, { status: 400 });
    }

    const db = adminDb();
    const codeSnap = await db.collection("referralCodes").doc(code.toUpperCase()).get();
    if (!codeSnap.exists) {
      return NextResponse.json({ error: "Реферальный код не найден" }, { status: 404 });
    }
    const { uid: referrerUid } = codeSnap.data() as { uid: string };
    if (referrerUid === newUid) {
      return NextResponse.json({ error: "Нельзя использовать свой же код" }, { status: 400 });
    }

    const newUserRef = db.collection("users").doc(newUid);
    const flagsSnap = await db.collection("settings").doc("features").get();
    const bonus = (flagsSnap.exists ? flagsSnap.data()?.referralBonusRub : undefined) ?? DEFAULT_FEATURE_FLAGS.referralBonusRub;

    const applied = await db.runTransaction(async (tx) => {
      const freshNewUser = await tx.get(newUserRef);
      if (!freshNewUser.exists) throw new Error("user-not-found");
      if (freshNewUser.data()?.referredBy) return false; // уже применяли — не начисляем повторно

      tx.update(newUserRef, { balance: FieldValue.increment(bonus), referredBy: referrerUid });
      tx.update(db.collection("users").doc(referrerUid), { balance: FieldValue.increment(bonus) });
      return true;
    });

    if (!applied) {
      return NextResponse.json({ error: "Бонус уже был начислен ранее" }, { status: 400 });
    }

    const linkSnap = await db.collection("telegramLinks").doc(referrerUid).get();
    if (linkSnap.exists) {
      const { chatId } = linkSnap.data() as { chatId: number };
      await sendTelegramMessage(chatId, `🎉 Кто-то зарегистрировался по твоей реферальной ссылке! +${bonus} ₽ на баланс.`);
    }

    return NextResponse.json({ ok: true, bonus });
  } catch (err) {
    console.error("apply-referral error:", err);
    return NextResponse.json({ error: "Не удалось применить реферальный код" }, { status: 500 });
  }
}
