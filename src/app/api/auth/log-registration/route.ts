import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { getClientIp } from "@/lib/getClientIp";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";

function getAdminUids(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// Порог, после которого считаем IP подозрительным на мультиаккаунтинг/накрутку и шлём алерт
// админам. Не блокирует регистрацию — только оповещает, окончательное решение (бан, проверка)
// остаётся за админом в /admin/registrations.
const SUSPICIOUS_THRESHOLD = 3;

/**
 * Вызывается клиентом сразу после успешной регистрации (см. authContext.tsx → register()) —
 * саму регистрацию делает Firebase Auth SDK напрямую с клиента (это стандартный путь и его не
 * стоит оборачивать сервером), а этот роут только фиксирует IP регистрации отдельной записью в
 * коллекции registrationLog, чтобы админ мог видеть все IP и обнаруживать паттерны абьюза.
 * Капча (см. Captcha.tsx) проверяется на форме регистрации ДО этого момента — здесь её проверять
 * уже поздно и незачем, аккаунт к этому вызову уже реально создан в Firebase Auth.
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

    // Идемпотентность: один пользователь может дёрнуть этот роут максимум один раз за свою
    // регистрацию, но на случай двойного вызова (например, повторный рендер клиента) не пишем
    // вторую запись — id документа равен uid.
    const logRef = db.collection("registrationLog").doc(uid);
    const existing = await logRef.get();
    if (existing.exists) return NextResponse.json({ ok: true, alreadyLogged: true });

    await logRef.set({
      uid,
      ip,
      userAgent: req.headers.get("user-agent") ?? "unknown",
      createdAt: Date.now(),
    });

    // Считаем, сколько всего регистраций было с этого IP (включая только что созданную).
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
    // Не критично для основного флоу регистрации — пользователь уже зарегистрирован, просто не
    // залогировался IP в этот раз. Возвращаем 200, чтобы клиент не показывал ошибку из-за этого.
    return NextResponse.json({ ok: false });
  }
}
