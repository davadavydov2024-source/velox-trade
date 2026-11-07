import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireFirebaseUid } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Для тех, кто зарегистрировался только через Telegram (почта у них служебная, @telegram.local, пароля нет):
 * добавить настоящую почту и пароль, чтобы можно было входить и так. POST { email, password }.
 * Тем, у кого уже есть почта и пароль, пароль меняется в самом приложении (нужен текущий пароль) — сюда им нельзя.
 */
export async function POST(req: NextRequest) {
  const uid = await requireFirebaseUid(req);
  if (!uid) return fail("Нужно войти в аккаунт", 401);
  if (!(await rateLimit(`msgr_cred_${uid}`, 6, 60 * 60_000))) return fail("Слишком много попыток, попробуй позже", 429);
  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120 || email.endsWith("@telegram.local")) return fail("Некорректная почта");
  if (password.length < 8 || password.length > 100) return fail("Пароль — от 8 символов");

  const auth = adminAuth();
  const user = await auth.getUser(uid).catch(() => null);
  if (!user) return fail("Аккаунт не найден", 404);
  if (user.email && !user.email.endsWith("@telegram.local")) return fail("У тебя уже есть почта и пароль — смени пароль в настройках", 403);

  const other = await auth.getUserByEmail(email).catch(() => null);
  if (other && other.uid !== uid) return fail("Эта почта уже занята другим аккаунтом", 409);
  try {
    await auth.updateUser(uid, { email, password, emailVerified: false });
  } catch (e: any) {
    return fail(e?.code === "auth/invalid-password" ? "Слишком простой пароль" : "Не удалось сохранить почту и пароль", 400);
  }
  return NextResponse.json({ ok: true });
}
