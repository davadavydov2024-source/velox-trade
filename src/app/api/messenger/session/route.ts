import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { DEVICE_RE, describeDevice, fail, requireMessenger, sendServiceMessage } from "@/lib/messenger/server";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dec = (v: string | null) => { try { return v ? decodeURIComponent(v) : ""; } catch { return v ?? ""; } };

/**
 * POST { deviceId } — клиент вызывает при каждом запуске/входе (deviceId — случайная строка 16–64 символа, хранится в localStorage устройства).
 * Новое устройство при уже существующих сеансах = «новый вход»: приходит сообщение от «MiliGram Push» в приложении
 * и в Telegram-бота Velox (если привязан), как уведомление о входе в Telegram. Первый вход (регистрация) не уведомляет.
 * -> { ok, isNew, notified } | 401 { revoked:true }, если сеанс уже завершён.
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  if (typeof b.deviceId !== "string" || !DEVICE_RE.test(b.deviceId)) return fail("Некорректный deviceId");
  const db = adminDb();
  const col = db.collection("messengerSessions").doc(me.uid).collection("list");
  const ref = col.doc(b.deviceId);
  const snap = await ref.get();
  const now = Date.now();

  if (snap.exists) {
    if (snap.data()!.revoked) return NextResponse.json({ error: "Сеанс завершён. Войди заново.", revoked: true }, { status: 401 });
    if (now - (snap.data()!.lastActiveAt ?? 0) > 5 * 60_000) await ref.update({ lastActiveAt: now });
    return NextResponse.json({ ok: true, isNew: false });
  }

  const others = await col.where("revoked", "==", false).limit(1).get();
  const ip = clientIp(req);
  const city = dec(req.headers.get("x-vercel-ip-city"));
  const country = dec(req.headers.get("x-vercel-ip-country"));
  const deviceName = describeDevice(req.headers.get("user-agent") ?? "");
  await ref.set({ id: b.deviceId, deviceName, ip, city, country, createdAt: now, lastActiveAt: now, revoked: false });

  let notified = false;
  if (!others.empty && (await rateLimit(`msgr_loginnotice_${me.uid}`, 3, 10 * 60_000))) {
    const place = [city, country].filter(Boolean).join(", ");
    const time = new Date(now).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "short", timeStyle: "short" });
    const text = `🔐 Новый вход в MiliGram\n\nУстройство: ${deviceName}\n${place ? `Место: ${place}\n` : ""}IP: ${ip}\nВремя: ${time} (МСК)\n\nЕсли это были не вы — откройте Настройки → Устройства и завершите этот сеанс, затем смените пароль.`;
    await Promise.allSettled([sendServiceMessage(me.uid, text), notifyTelegramServer(me.uid, `MiliGram Push\n\n${text}`)]);
    notified = true;
  }
  return NextResponse.json({ ok: true, isNew: true, notified });
}

/** GET ?deviceId= — список моих сеансов (устройств): { sessions: [{ id, deviceName, city, country, ip, createdAt, lastActiveAt, current }] }. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const cur = req.nextUrl.searchParams.get("deviceId") ?? req.headers.get("x-miligram-device") ?? "";
  const snap = await adminDb().collection("messengerSessions").doc(me.uid).collection("list").orderBy("lastActiveAt", "desc").limit(50).get();
  const sessions = snap.docs.map((d) => d.data()).filter((s) => !s.revoked).map((s) => ({ id: s.id, deviceName: s.deviceName, city: s.city ?? "", country: s.country ?? "", ip: s.ip ?? "", createdAt: s.createdAt, lastActiveAt: s.lastActiveAt, current: s.id === cur }));
  return NextResponse.json({ sessions });
}
