import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

/**
 * Приложение MiliGram обменивает код привязки на долгоживущий токен устройства.
 * tgUserId берётся из telegramLinks (привязка Telegram на Velox, подтверждённая ботом), а НЕ из тела
 * запроса — иначе любой мог бы выдать себя за чужой Telegram-аккаунт.
 * Код: 10 символов из 32 (≈10^15 вариантов), одноразовый, живёт 10 минут — перебор нереалистичен.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const code = String(body.code ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const appVersion = String(body.appVersion ?? "").slice(0, 20);
    if (code.length !== 10) return NextResponse.json({ error: "Неверный код" }, { status: 400 });

    const db = adminDb();
    const codeRef = db.collection("miligramLinkCodes").doc(code);
    const uid = await db.runTransaction(async (tx) => {
      const snap = await tx.get(codeRef);
      const d = snap.data() as { uid: string; expiresAt: number } | undefined;
      if (!d || d.expiresAt < Date.now()) return null;
      tx.delete(codeRef); // одноразовый
      return d.uid;
    });
    if (!uid) return NextResponse.json({ error: "Код неверный или устарел" }, { status: 400 });

    const tg = (await db.collection("telegramLinks").doc(uid).get()).data() as { chatId?: number } | undefined;
    if (!tg?.chatId) return NextResponse.json({ error: "Telegram не привязан к аккаунту" }, { status: 400 });

    const existing = (await db.collection("miligramProfiles").doc(uid).get()).data();
    if (existing?.banned) return NextResponse.json({ error: "Доступ к MiliGram для этого аккаунта закрыт" }, { status: 403 });

    const token = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");
    const now = Date.now();
    await Promise.all([
      db.collection("miligramDevices").doc(hash).set({ uid, createdAt: now, appVersion }),
      db.collection("miligramProfiles").doc(uid).set({ uid, tgUserId: tg.chatId, linkedAt: now, lastSeenAt: now, appVersion, updatedAt: now }, { merge: true }),
    ]);
    return NextResponse.json({ token, uid });
  } catch {
    return NextResponse.json({ error: "Не удалось привязать" }, { status: 400 });
  }
}
