import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";
import { SERVICE_UID, sendServiceMessage } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const PAGE = 100;
const PARALLEL = 10;

/** GET — последние рассылки (текст, кому, сколько доставлено). */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const snap = await adminDb().collection("messengerBroadcasts").orderBy("createdAt", "desc").limit(10).get();
  return NextResponse.json({ broadcasts: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
}

/**
 * POST { text, target: "all"|"premium"|"verified", silent?, broadcastId?, cursor? } — рассылка от «MiliGram Push» (как рассылка из официального канала Telegram):
 * каждому адресату приходит сообщение в служебный чат + пуш. Обрабатывает до 100 аккаунтов за вызов:
 * -> { broadcastId, processed, sent, nextCursor, done }. Пока done:false — вызывай снова с broadcastId и nextCursor (админка делает это сама, показывая прогресс).
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const b = await req.json().catch(() => ({}));
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length < 1 || text.length > 3500) return NextResponse.json({ error: "Текст рассылки — от 1 до 3500 символов" }, { status: 400 });
  const target = ["all", "premium", "verified"].includes(b.target) ? b.target : "all";
  const db = adminDb();

  let broadcastId: string = typeof b.broadcastId === "string" && b.broadcastId && !b.broadcastId.includes("/") ? b.broadcastId : "";
  if (!broadcastId) {
    const ref = db.collection("messengerBroadcasts").doc();
    await ref.set({ text, target, silent: b.silent === true, createdBy: admin.uid, createdAt: Date.now(), sent: 0, processed: 0, done: false });
    broadcastId = ref.id;
    await logAdminAccess(admin.uid, "messenger_broadcast_start", { broadcastId, target });
  }
  const bref = db.collection("messengerBroadcasts").doc(broadcastId);

  let q = db.collection("messengerAccounts").orderBy("createdAt").limit(PAGE);
  if (typeof b.cursor === "number") q = q.startAfter(b.cursor);
  const page = await q.get();
  const now = Date.now();
  const recipients = page.docs
    .map((d) => d.data())
    .filter((a) => a.uid !== SERVICE_UID && !a.banned && (target === "all" || (target === "premium" && (a.premiumUntil ?? 0) > now) || (target === "verified" && a.verified === true)));

  let sent = 0;
  for (let i = 0; i < recipients.length; i += PARALLEL) {
    const results = await Promise.allSettled(recipients.slice(i, i + PARALLEL).map((a) => sendServiceMessage(a.uid, text, { silent: b.silent === true })));
    sent += results.filter((r) => r.status === "fulfilled").length;
  }
  const last = page.docs[page.docs.length - 1]?.data().createdAt as number | undefined;
  const done = page.size < PAGE;
  await bref.update({ sent: FieldValue.increment(sent), processed: FieldValue.increment(page.size), ...(done ? { done: true, finishedAt: Date.now() } : {}) });
  return NextResponse.json({ broadcastId, processed: page.size, sent, nextCursor: done ? null : last ?? null, done });
}
