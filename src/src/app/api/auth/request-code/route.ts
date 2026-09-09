import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { sendTelegramMessage, generateSixDigitCode } from "@/lib/telegramBot";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Укажи email" }, { status: 400 });
    }

    const db = adminDb();

    const flagsSnap = await db.collection("settings").doc("features").get();
    const flagsData = flagsSnap.exists ? flagsSnap.data() : null;
    if (flagsData && flagsData.telegramLoginEnabled === false) {
      return NextResponse.json({ error: "Вход по коду в Telegram временно отключён администратором." }, { status: 403 });
    }

    const auth = adminAuth();

    let uid: string;
    try {
      const user = await auth.getUserByEmail(email.trim().toLowerCase());
      uid = user.uid;
    } catch {
      // Не раскрываем, существует ли аккаунт с таким email — общая формулировка для обоих случаев.
      return NextResponse.json({ error: "Если аккаунт с таким email привязан к Telegram, код отправлен." });
    }

    const linkSnap = await db.collection("telegramLinks").doc(uid).get();
    if (!linkSnap.exists) {
      return NextResponse.json(
        { error: "Telegram не привязан к этому аккаунту. Сначала привяжи его в Профиль → Безопасность (с исходного устройства, где ты уже вошёл)." },
        { status: 400 }
      );
    }
    const { chatId } = linkSnap.data() as { chatId: number };

    // Простая защита от спама: не чаще одного кода в 30 секунд на аккаунт.
    const existing = await db.collection("loginCodes").doc(uid).get();
    if (existing.exists) {
      const data = existing.data() as { createdAt: number };
      if (Date.now() - data.createdAt < 30_000) {
        return NextResponse.json({ error: "Код уже отправлен. Подожди немного перед повторным запросом." }, { status: 429 });
      }
    }

    const code = generateSixDigitCode();
    await db.collection("loginCodes").doc(uid).set({
      code,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });

    const sent = await sendTelegramMessage(chatId, `Код для входа в Velox Trade: ${code}\nДействителен 5 минут. Никому не сообщай этот код.`);
    if (!sent) {
      return NextResponse.json({ error: "Не удалось отправить сообщение в Telegram. Проверь TELEGRAM_BOT_TOKEN на сервере." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("request-code error:", err);
    return NextResponse.json({ error: "Не удалось отправить код. Попробуй позже." }, { status: 500 });
  }
}
