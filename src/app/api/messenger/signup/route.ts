import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { RESERVED_HANDLES, HANDLE_RE, createAccount, createLinkRequest, fail, gatePassed, telegramConflict } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PENDING_TTL = 30 * 60_000;

/**
 * Регистрация MiliGram по почте и паролю. Telegram — НЕобязательно:
 *  POST { email, password, handle, displayName, gateToken? } -> { done:true }: аккаунт создан сразу, дальше обычный вход почтой и паролем.
 *  POST { ..., telegram:true } -> { code, botUrl }: «почта + Telegram» — открыть botUrl в Telegram и нажать «Старт».
 *  GET ?code=<code> -> { done } — только для варианта с Telegram: опрашивать раз в 2–3 с; когда бот привязан, аккаунт создаётся и приходит done:true.
 *  (Регистрация только через Telegram идёт другим путём: вход через Telegram → экран «Продолжить» → /api/messenger/join.)
 */
export async function POST(req: NextRequest) {
  if (!(await rateLimit(`msgr_signup_${clientIp(req)}`, 8, 60 * 60_000))) return fail("Слишком много попыток, попробуй позже", 429);
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
  const db = adminDb();
  if (RESERVED_HANDLES.has(handle) || (await db.collection("messengerHandles").doc(handle).get()).exists) return fail("Этот @username уже занят", 409);

  const auth = adminAuth();
  const withTelegram = b.telegram === true;
  let uid: string;
  let created = false;
  try {
    uid = (await auth.createUser({ email, password, displayName })).uid;
    created = true;
  } catch (e: any) {
    if (e?.code === "auth/invalid-password") return fail("Слишком простой пароль");
    if (e?.code !== "auth/email-already-exists") return fail("Не удалось создать аккаунт");
    // Почта уже есть: если это недозавершённая регистрация MiliGram — даём начать заново; иначе просим войти.
    const existing = await auth.getUserByEmail(email).catch(() => null);
    if (!existing) return fail("Не удалось создать аккаунт");
    const [acc, pend] = await Promise.all([db.collection("messengerAccounts").doc(existing.uid).get(), db.collection("messengerPending").doc(existing.uid).get()]);
    if (acc.exists) return fail("Эта почта уже зарегистрирована в MiliGram — просто войди", 409);
    if (!pend.exists) return fail("Эта почта уже есть на сайте Velox Trade: войди в аккаунт и открой MiliGram — там останется выбрать имя и привязать Telegram", 409);
    await auth.updateUser(existing.uid, { password, displayName });
    uid = existing.uid;
  }

  if (!withTelegram) {
    // Telegram не нужен: создаём аккаунт сразу (недозавершённую заявку с Telegram, если была, убираем)
    try {
      await createAccount(uid, handle, displayName);
    } catch (e: any) {
      if (created) await auth.deleteUser(uid).catch(() => {});
      return fail(e?.message === "handle-taken" ? "Этот @username уже занят" : "Не удалось создать аккаунт", e?.message === "handle-taken" ? 409 : 500);
    }
    await db.collection("messengerPending").doc(uid).delete().catch(() => {});
    return NextResponse.json({ done: true });
  }

  const { code, botUrl } = await createLinkRequest(uid);
  await db.collection("messengerPending").doc(uid).set({ handle, displayName, code, createdAt: Date.now() });
  return NextResponse.json({ code, botUrl });
}

export async function GET(req: NextRequest) {
  if (!(await rateLimit(`msgr_signup_poll_${clientIp(req)}`, 300, 10 * 60_000))) return fail("Слишком часто", 429);
  const code = req.nextUrl.searchParams.get("code") ?? "";
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(code)) return fail("Неверный код");
  const db = adminDb();
  const found = await db.collection("messengerPending").where("code", "==", code).limit(1).get();
  if (found.empty) return NextResponse.json({ done: false, expired: true });
  const pendRef = found.docs[0].ref;
  const uid = pendRef.id;
  const p = found.docs[0].data() as { handle: string; displayName: string; createdAt: number };

  const cleanup = async () => {
    await Promise.allSettled([adminAuth().deleteUser(uid), pendRef.delete(), db.collection("telegramLinks").doc(uid).delete(), db.collection("telegramLinkRequests").doc(code).delete()]);
  };
  if (Date.now() - p.createdAt > PENDING_TTL) {
    await cleanup();
    return NextResponse.json({ done: false, expired: true });
  }

  const link = (await db.collection("telegramLinks").doc(uid).get()).data() as { chatId?: number } | undefined;
  if (!link?.chatId) return NextResponse.json({ done: false });
  if (await telegramConflict(uid, link.chatId)) {
    await cleanup();
    return fail("Этот Telegram уже привязан к другому аккаунту MiliGram", 409);
  }
  try {
    await createAccount(uid, p.handle, p.displayName);
  } catch (e: any) {
    await cleanup();
    return fail(e?.message === "handle-taken" ? "Этот @username успели занять — начни регистрацию заново" : "Не удалось создать аккаунт", 409);
  }
  await pendRef.delete();
  return NextResponse.json({ done: true });
}
