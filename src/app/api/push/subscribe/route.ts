import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { PUSH_SUBS_COLLECTION, subscriptionDocId } from "@/lib/webPushServer";
import { isAllowedPushEndpoint } from "@/lib/webpushProtocol";

export const runtime = "nodejs";

/**
 * Сохраняет Web Push подписку устройства за текущим пользователем.
 * Документ называется по хэшу endpoint — поэтому повторное включение не плодит дубли, а если на
 * этом браузере сменился аккаунт, подписка просто переходит новому владельцу.
 * Тело: { subscription: { endpoint, keys: { p256dh, auth } } }.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      deviceId?: string;
    };
    const endpoint = body.subscription?.endpoint;
    const p256dh = body.subscription?.keys?.p256dh;
    const auth = body.subscription?.keys?.auth;
    if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string" || endpoint.length > 2000) {
      return NextResponse.json({ error: "Неверная подписка" }, { status: 400 });
    }
    if (!isAllowedPushEndpoint(endpoint)) {
      return NextResponse.json({ error: "Этот push-сервис не поддерживается" }, { status: 400 });
    }
    if (Buffer.from(p256dh, "base64url").length !== 65 || Buffer.from(auth, "base64url").length < 16) {
      return NextResponse.json({ error: "Неверные ключи подписки" }, { status: 400 });
    }

    await adminDb()
      .collection(PUSH_SUBS_COLLECTION)
      .doc(subscriptionDocId(endpoint))
      .set({ uid: decoded.uid, endpoint, p256dh, auth, ...(typeof body.deviceId === "string" && body.deviceId.length <= 100 ? { deviceId: body.deviceId } : {}), userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200), updatedAt: Date.now() }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("push/subscribe error:", err);
    return NextResponse.json({ error: "Не удалось сохранить подписку" }, { status: 500 });
  }
}
