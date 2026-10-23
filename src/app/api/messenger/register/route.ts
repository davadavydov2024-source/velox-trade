import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { createAccount, fail, HANDLE_RE, gatePassed } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** Регистрация: gateToken + почта + пароль + @handle + имя. Создаёт пользователя Firebase Auth и аккаунт мессенджера. */
export async function POST(req: NextRequest) {
  if (!(await rateLimit(`msgr_register_${clientIp(req)}`, 5, 60 * 60_000))) return fail("Слишком много попыток, попробуй позже", 429);
  const b = await req.json().catch(() => ({}));
  if (!gatePassed(b.gateToken)) return fail("Нужен код доступа", 403);

  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const handle = String(b.handle ?? "").trim().toLowerCase().replace(/^@/, "");
  const displayName = String(b.displayName ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return fail("Некорректная почта");
  if (password.length < 8 || password.length > 100) return fail("Пароль — от 8 символов");
  if (!HANDLE_RE.test(handle)) return fail("@username: 4–24 символа, латиница, цифры и _, начинается с буквы");
  if (displayName.length < 2 || displayName.length > 40) return fail("Имя — от 2 до 40 символов");

  let uid: string;
  try {
    uid = (await adminAuth().createUser({ email, password, displayName })).uid;
  } catch (e: any) {
    if (e?.code === "auth/email-already-exists") return fail("Эта почта уже зарегистрирована. Войди в аккаунт и открой мессенджер оттуда", 409);
    if (e?.code === "auth/invalid-password") return fail("Слишком простой пароль");
    return fail("Не удалось создать аккаунт");
  }
  try {
    await createAccount(uid, handle, displayName);
  } catch (e: any) {
    await adminAuth().deleteUser(uid).catch(() => {});
    if (e?.message === "handle-taken") return fail("Этот @username уже занят", 409);
    console.error("messenger register error:", e);
    return fail("Не удалось создать аккаунт", 500);
  }
  return NextResponse.json({ ok: true });
}
