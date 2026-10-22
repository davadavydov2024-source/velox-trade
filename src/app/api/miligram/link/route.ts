import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireUser } from "@/lib/requireUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без похожих символов (0/O, 1/I)
const CODE_TTL_MS = 10 * 60 * 1000;

function makeCode(): string {
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Статус привязки MiliGram для текущего пользователя Velox (страница /profile/miligram). */
export async function GET(req: NextRequest) {
  const uid = await requireUser(req);
  if (!uid) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const db = adminDb();
  const [prof, tg] = await Promise.all([db.collection("miligramProfiles").doc(uid).get(), db.collection("telegramLinks").doc(uid).get()]);
  const p = prof.data();
  return NextResponse.json({ telegramLinked: tg.exists, linked: !!p?.linkedAt, banned: p?.banned === true, badge: p?.badge ?? null });
}

/** Выдаёт одноразовый код (10 минут) — его вводят в приложении MiliGram, чтобы привязать его к аккаунту Velox. */
export async function POST(req: NextRequest) {
  const uid = await requireUser(req);
  if (!uid) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const db = adminDb();
  if (!(await db.collection("telegramLinks").doc(uid).get()).exists) {
    return NextResponse.json({ error: "Сначала привяжи Telegram к аккаунту Velox (раздел «Безопасность» или бот)" }, { status: 400 });
  }
  const code = makeCode();
  await db.collection("miligramLinkCodes").doc(code).set({ uid, expiresAt: Date.now() + CODE_TTL_MS });
  return NextResponse.json({ code: `${code.slice(0, 5)}-${code.slice(5)}`, expiresInSec: CODE_TTL_MS / 1000 });
}
