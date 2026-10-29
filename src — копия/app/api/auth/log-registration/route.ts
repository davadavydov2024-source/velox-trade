import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getClientIp } from "@/lib/getClientIp";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";

function getAdminUids(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

const SUSPICIOUS_THRESHOLD = 3;

/**
 * Вызывается клиентом сразу после успешной регистрации (email/пароль, Google) — саму регистрацию
 * делает Firebase Auth SDK напрямую с клиента, а этот роут только фиксирует IP регистрации
 * отдельной записью в коллекции registrationLog, чтобы админ мог видеть все IP и обнаруживать
 * паттерны абьюза (см. /admin/registrations). Регистрация через Telegram логируется отдельно, в
 * момент создания аккаунта на сервере (см. api/auth/telegram-widget и api/telegram/webhook), где
 * IP тоже доступен напрямую.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const decoded = await adminAuth().verifyIdToken(idToken).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Сессия истекла" }, { status: 401 });
    const uid = decoded.uid;

    const ip = getClientIp(req);
    const db = adminDb();

    const logRef = db.collection("registrationLog").doc(uid);
    const existing = await logRef.get();
    if (existing.exists) return NextResponse.json({ ok: true, alreadyLogged: true });

    await logRef.set({
      uid,
      ip,
      userAgent: req.headers.get("user-agent") ?? "unknown",
      createdAt: Date.now(),
    });

    const sameIpSnap = await db.collection("registrationLog").where("ip", "==", ip).get();
    const count = sameIpSnap.size;

    if (count >= SUSPICIOUS_THRESHOLD) {
      const alertText = `⚠️ Подозрение на массовую регистрацию: ${count} аккаунтов с одного IP (${ip}). Последний — ${uid}. Проверь /admin/registrations.`;
      getAdminUids().forEach((adminUid) => {
        notifyTelegramServer(adminUid, alertText);
        sendWebPush(adminUid, { title: "Подозрительная активность", body: `${count} регистраций с IP ${ip}`, url: "/admin/registrations" }, "messages");
      });
    }

    return NextResponse.json({ ok: true, sameIpCount: count });
  } catch (err) {
    console.error("auth/log-registration error:", err);
    return NextResponse.json({ ok: false });
  }
}
