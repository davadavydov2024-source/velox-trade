import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { createAccount, createLinkRequest, fail, gatePassed, HANDLE_RE, requireFirebaseUid, telegramConflict } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — привязан ли Telegram к этому аккаунту (опрос на экране «Подтверди в Telegram»). */
export async function GET(req: NextRequest) {
  const uid = await requireFirebaseUid(req);
  if (!uid) return fail("Нужно войти в аккаунт", 401);
  const [tg, acc] = await Promise.all([adminDb().collection("telegramLinks").doc(uid).get(), adminDb().collection("messengerAccounts").doc(uid).get()]);
  return NextResponse.json({ telegramLinked: tg.exists, hasAccount: acc.exists });
}

/**
 * Для тех, кто уже вошёл на сайте (аккаунт Velox): создать аккаунт MiliGram. Нужен привязанный Telegram:
 * если не привязан — ответ { needTelegram:true, botUrl }: открыть бота, нажать «Старт», затем повторить этот же запрос.
 */
export async function POST(req: NextRequest) {
  const uid = await requireFirebaseUid(req);
  if (!uid) return fail("Нужно войти в аккаунт", 401);
  if (!(await rateLimit(`msgr_join_${clientIp(req)}`, 30, 60 * 60_000))) return fail("Слишком много попыток", 429);
  const b = await req.json().catch(() => ({}));
  if (!gatePassed(b.gateToken)) return fail("Нужен код доступа", 403);
  const db = adminDb();
  if ((await db.collection("messengerAccounts").doc(uid).get()).exists) return NextResponse.json({ ok: true, existed: true });

  const handle = String(b.handle ?? "").trim().toLowerCase().replace(/^@/, "");
  const displayName = String(b.displayName ?? "").trim();
  if (!HANDLE_RE.test(handle)) return fail("@username: 4–24 символа, латиница, цифры и _, начинается с буквы");
  if (displayName.length < 2 || displayName.length > 40) return fail("Имя — от 2 до 40 символов");

  const link = (await db.collection("telegramLinks").doc(uid).get()).data() as { chatId?: number } | undefined;
  if (!link?.chatId) {
    const { code, botUrl } = await createLinkRequest(uid);
    return NextResponse.json({ needTelegram: true, code, botUrl });
  }
  if (await telegramConflict(uid, link.chatId)) return fail("Этот Telegram уже привязан к другому аккаунту MiliGram", 409);

  const user = await adminAuth().getUser(uid);
  try {
    await createAccount(uid, handle, displayName, user.photoURL ?? null);
  } catch (e: any) {
    if (e?.message === "handle-taken") return fail("Этот @username уже занят", 409);
    return fail("Не удалось создать аккаунт", 500);
  }
  return NextResponse.json({ ok: true });
}
