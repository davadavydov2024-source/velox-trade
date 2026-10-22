import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { createAccount, fail, HANDLE_RE, requireFirebaseUid, verifyGateToken } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** Для тех, кто уже вошёл на сайт (аккаунт Velox): создать аккаунт мессенджера по коду доступа. */
export async function POST(req: NextRequest) {
  const uid = await requireFirebaseUid(req);
  if (!uid) return fail("Нужно войти в аккаунт", 401);
  if (!(await rateLimit(`msgr_join_${clientIp(req)}`, 10, 60 * 60_000))) return fail("Слишком много попыток", 429);
  const b = await req.json().catch(() => ({}));
  if (!verifyGateToken(b.gateToken)) return fail("Сначала введи код доступа", 403);
  if ((await adminDb().collection("messengerAccounts").doc(uid).get()).exists) return NextResponse.json({ ok: true, existed: true });

  const handle = String(b.handle ?? "").trim().toLowerCase().replace(/^@/, "");
  const displayName = String(b.displayName ?? "").trim();
  if (!HANDLE_RE.test(handle)) return fail("@username: 4–24 символа, латиница, цифры и _, начинается с буквы");
  if (displayName.length < 2 || displayName.length > 40) return fail("Имя — от 2 до 40 символов");
  const user = await adminAuth().getUser(uid);
  try {
    await createAccount(uid, handle, displayName, user.photoURL ?? null);
  } catch (e: any) {
    if (e?.message === "handle-taken") return fail("Этот @username уже занят", 409);
    return fail("Не удалось создать аккаунт", 500);
  }
  return NextResponse.json({ ok: true });
}
