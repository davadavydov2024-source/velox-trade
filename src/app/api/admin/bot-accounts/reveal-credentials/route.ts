import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { isAdminUid } from "@/lib/users";
import { decryptSecret, generateTotpCode, totpSecondsRemaining } from "@/lib/botCredentialCrypto";
import { notifyAdminTelegramServer } from "@/lib/telegramNotifyServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Показ пароля/текущего 2FA-кода бота — КАЖДЫЙ вызов пишет запись в botCredentialAccessLog
 * (кто, когда, что именно посмотрел). Это и есть тот самый лог для прозрачности: если админов
 * или помощников несколько, всегда видно, кто и когда доставал учётку конкретного бота.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded || !isAdminUid(decoded.uid)) return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });

    const { botId } = await req.json();
    if (typeof botId !== "string" || !botId) return NextResponse.json({ error: "Не указан бот" }, { status: 400 });

    const db = adminDb();
    const credSnap = await db.collection("botCredentials").doc(botId).get();
    if (!credSnap.exists) return NextResponse.json({ error: "Учётные данные для этого бота ещё не заданы" }, { status: 404 });
    const cred = credSnap.data() as { passwordEnc?: string; totpSecretEnc?: string };

    const adminSnap = await db.collection("users").doc(decoded.uid).get();
    const adminName: string = adminSnap.data()?.displayName ?? "Администратор";

    const password = cred.passwordEnc ? decryptSecret(cred.passwordEnc) : null;
    const totpCode = cred.totpSecretEnc ? generateTotpCode(decryptSecret(cred.totpSecretEnc)) : null;
    const totpSecondsLeft = totpCode ? totpSecondsRemaining() : null;

    await db.collection("botCredentialAccessLog").add({
      botId,
      adminUid: decoded.uid,
      adminName,
      field: password && totpCode ? "both" : password ? "password" : "totp",
      at: Date.now(),
    });

    const botSnap = await db.collection("botAccounts").doc(botId).get();
    const botNickname: string = botSnap.data()?.nickname ?? botId;
    // Уведомляем в общий админ-чат при каждом просмотре — если админов/помощников несколько,
    // остальные сразу видят, что кто-то доставал учётку бота, а не узнают об этом только из лога.
    notifyAdminTelegramServer(`🔑 ${adminName} посмотрел(а) учётные данные бота «${botNickname}»`);

    return NextResponse.json({ password, totpCode, totpSecondsLeft });
  } catch (err: any) {
    if (err?.message?.includes("BOT_CREDENTIALS_KEY")) {
      return NextResponse.json({ error: "На сервере не задан ключ шифрования (BOT_CREDENTIALS_KEY) — обратись к разработчику" }, { status: 500 });
    }
    console.error("admin/bot-accounts/reveal-credentials error:", err);
    return NextResponse.json({ error: "Не удалось получить учётные данные" }, { status: 500 });
  }
}
