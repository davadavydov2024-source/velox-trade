import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";
import { notifyTelegramServer } from "@/lib/telegramNotifyServer";
import { sendWebPush } from "@/lib/webPushServer";

export const runtime = "nodejs";

/**
 * Админ пишет в чат заказа ОТ ЛИЦА АДМИНИСТРАЦИИ (при споре, жалобе, подозрении на мошенничество).
 * Сообщение получает from:"admin" — у участников оно помечено «Админ». Обоим участникам уходит
 * уведомление. Действие пишется в журнал adminAuditLog.
 * Тело: { id: orderId, text }.
 */
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if ("error" in guard) return guard.error;

    const { id, text } = (await req.json().catch(() => ({}))) as { id?: string; text?: string };
    const clean = typeof text === "string" ? text.trim().slice(0, 2000) : "";
    if (typeof id !== "string" || !id || !clean) return NextResponse.json({ error: "Укажи чат и текст" }, { status: 400 });

    const ref = adminDb().collection("orderChats").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Чат не найден" }, { status: 404 });
    const chat = snap.data() as { buyerId: string; sellerId: string };

    const message = { from: "admin", text: clean, createdAt: Date.now() };
    await ref.update({ messages: FieldValue.arrayUnion(message), updatedAt: Date.now() });
    await logAdminAccess(guard.uid, "write_chat_as_admin", { chatId: id });

    const preview = clean.length > 120 ? `${clean.slice(0, 120)}…` : clean;
    for (const uid of new Set([chat.buyerId, chat.sellerId])) {
      notifyTelegramServer(uid, `⚖️ Администратор написал в чате заказа:\n${preview}`);
      sendWebPush(uid, { title: "Сообщение от администрации", body: preview, url: "/chats" }, "messages");
    }
    return NextResponse.json({ ok: true, message });
  } catch (err) {
    console.error("admin/messages/send error:", err);
    return NextResponse.json({ error: "Не удалось отправить сообщение" }, { status: 500 });
  }
}
