import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT || "veloxtrade_robot";

function randomToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 20; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/**
 * Шаг 1 регистрации по паролю: вместо кода на почту (требовал настроенной отправки писем) человек
 * обязательно подключает Telegram-бота. Создаём заявку с 6-значным кодом и отдаём ссылку на бота
 * (start=verify_<token>) — вебхук бота, получив /start, пришлёт этот код прямо в Telegram (см.
 * handleAccountLinking в api/telegram/webhook). Без открытого бота код просто нигде не появится.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
    }
    try {
      await adminAuth().getUserByEmail(normalized);
      return NextResponse.json({ error: "Этот email уже зарегистрирован — войди в аккаунт" }, { status: 409 });
    } catch {
      // аккаунта с таким email нет — можно продолжать
    }

    const token = randomToken();
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await adminDb().collection("tgVerifyRequests").doc(token).set({
      email: normalized,
      code,
      status: "pending",
      attempts: 0,
      createdAt: Date.now(),
    });
    return NextResponse.json({ ok: true, token, botUrl: `https://t.me/${BOT}?start=verify_${token}` });
  } catch (err) {
    console.error("tg-verify/start error:", err);
    return NextResponse.json({ error: "Не удалось начать подтверждение" }, { status: 500 });
  }
}
