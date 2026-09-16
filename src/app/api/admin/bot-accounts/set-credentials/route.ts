import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { isAdminUid } from "@/lib/users";
import { encryptSecret } from "@/lib/botCredentialCrypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Сохранение/обновление пароля и/или 2FA-секрета для СВОЕГО ЖЕ бот-аккаунта площадки (см.
 * развёрнутый комментарий в lib/botCredentialCrypto.ts — это не пользовательские данные и не
 * автоматизация). Доступно только полноценным админам (не помощникам) — эти данные не проходят
 * даже через обычные права isHelper, которые есть у части других /admin/deliveries действий.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded || !isAdminUid(decoded.uid)) return NextResponse.json({ error: "Доступ только для админов" }, { status: 403 });

    const { botId, password, totpSecret } = await req.json();
    if (typeof botId !== "string" || !botId) return NextResponse.json({ error: "Не указан бот" }, { status: 400 });

    const db = adminDb();
    const botRef = db.collection("botAccounts").doc(botId);
    const botSnap = await botRef.get();
    if (!botSnap.exists) return NextResponse.json({ error: "Бот не найден" }, { status: 404 });

    const update: Record<string, unknown> = {};
    if (typeof password === "string" && password) update.passwordEnc = encryptSecret(password);
    if (typeof totpSecret === "string" && totpSecret) update.totpSecretEnc = encryptSecret(totpSecret.replace(/\s+/g, ""));

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Нечего сохранять — заполни пароль и/или 2FA-секрет" }, { status: 400 });
    }

    await db.collection("botCredentials").doc(botId).set({ ...update, updatedAt: Date.now(), updatedByUid: decoded.uid }, { merge: true });
    await botRef.update({ hasCredentials: true });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.message?.includes("BOT_CREDENTIALS_KEY")) {
      return NextResponse.json({ error: "На сервере не задан ключ шифрования (BOT_CREDENTIALS_KEY) — обратись к разработчику" }, { status: 500 });
    }
    console.error("admin/bot-accounts/set-credentials error:", err);
    return NextResponse.json({ error: "Не удалось сохранить учётные данные" }, { status: 500 });
  }
}
