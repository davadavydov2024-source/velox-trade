import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac } from "crypto";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface TelegramWidgetData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Проверяет подпись данных от Telegram Login Widget (см. https://core.telegram.org/widgets/login) —
 * это официальный однотаповый вход через oauth.telegram.org, отдельный от текущего бота-с-кодами
 * (см. api/telegram/webhook). Алгоритм из документации Telegram: строка data-check-string из всех
 * полей кроме hash (отсортированных по алфавиту, key=value через \n), HMAC-SHA256 от неё с ключом
 * SHA256(bot_token), должен совпасть с hash. Без этой проверки кто угодно мог бы прислать чужой
 * telegram id и войти под чужим аккаунтом.
 */
function verifyTelegramAuth(data: TelegramWidgetData): boolean {
  if (!BOT_TOKEN) return false;
  const { hash, ...rest } = data;
  const checkString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${(rest as any)[key]}`)
    .join("\n");
  const secretKey = createHash("sha256").update(BOT_TOKEN).digest();
  const computedHash = createHmac("sha256", secretKey).update(checkString).digest("hex");
  if (computedHash !== hash) return false;

  // auth_date старше суток — виджет-сессия считается протухшей, просим войти заново, а не
  // принимаем сколь угодно старую подпись (например, если её кто-то сохранил и переиспользует).
  const ageSeconds = Date.now() / 1000 - data.auth_date;
  return ageSeconds < 24 * 60 * 60;
}

export async function POST(req: NextRequest) {
  try {
    if (!BOT_TOKEN) return NextResponse.json({ error: "Вход через Telegram временно недоступен" }, { status: 500 });

    const data = (await req.json()) as TelegramWidgetData;
    if (!data.id || !data.hash || !data.auth_date) {
      return NextResponse.json({ error: "Некорректные данные от Telegram" }, { status: 400 });
    }
    if (!verifyTelegramAuth(data)) {
      return NextResponse.json({ error: "Подпись Telegram не прошла проверку — попробуй войти заново" }, { status: 401 });
    }

    const db = adminDb();
    const auth = adminAuth();
    const telegramId = String(data.id);
    const displayName = [data.first_name, data.last_name].filter(Boolean).join(" ") || "Игрок";

    // Ищем уже существующую привязку — тот же telegram id мог раньше входить через бота-с-кодами
    // (см. telegramLinks в api/telegram/webhook) или через этот же виджет ранее.
    const widgetLinkRef = db.collection("telegramWidgetLinks").doc(telegramId);
    const widgetLinkSnap = await widgetLinkRef.get();

    let uid: string;
    if (widgetLinkSnap.exists) {
      uid = (widgetLinkSnap.data() as { uid: string }).uid;
    } else {
      // Firebase Auth не поддерживает Telegram как нативного провайдера — используем synthetic
      // email вида telegram_<id>@telegram.local, как принято для кастомных OAuth-интеграций.
      const syntheticEmail = `telegram_${telegramId}@telegram.local`;
      try {
        const existing = await auth.getUserByEmail(syntheticEmail);
        uid = existing.uid;
      } catch {
        const created = await auth.createUser({ email: syntheticEmail, displayName, photoURL: data.photo_url });
        uid = created.uid;
        await db.collection("users").doc(uid).set({
          email: syntheticEmail,
          displayName,
          photoURL: data.photo_url ?? null,
          balance: 0,
          badges: ["user"],
          emailVerified: true, // Telegram уже подтвердил личность своей подписью — email тут синтетический, верификация не нужна
          banned: false,
          createdAt: Date.now(),
          lastLoginAt: Date.now(),
        });
      }
      await widgetLinkRef.set({ uid, telegramUsername: data.username ?? null, linkedAt: Date.now() });
      // Тот же формат привязки, что использует бот-с-кодами — чтобы /profile/security и рассылки
      // видели этот аккаунт как имеющий привязанный Telegram, независимо от способа входа.
      await db
        .collection("telegramLinks")
        .doc(uid)
        .set({ chatId: data.id, telegramUsername: data.username ?? null, linkedAt: Date.now() }, { merge: true });
    }

    await db.collection("users").doc(uid).update({ lastLoginAt: Date.now() });
    const customToken = await auth.createCustomToken(uid);

    return NextResponse.json({ token: customToken });
  } catch (err) {
    console.error("auth/telegram-widget error:", err);
    return NextResponse.json({ error: "Не удалось войти через Telegram" }, { status: 500 });
  }
}
