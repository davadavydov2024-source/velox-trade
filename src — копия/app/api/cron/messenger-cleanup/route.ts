import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Раз в день (vercel.json -> crons): физически удаляет сообщения с истёкшим автоудалением и просроченные истории.
 * Клиент и так скрывает сообщения, у которых expireAt в прошлом, — это только уборка. Защита: CRON_SECRET, как у остальных cron.
 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }
  const db = adminDb();
  const now = Date.now();
  let messages = 0;
  let stories = 0;

  const chats = await db.collection("messengerChats").where("autoDeleteSec", ">", 0).limit(200).get();
  for (const c of chats.docs) {
    const old = await c.ref.collection("messages").where("expireAt", "<=", now).limit(200).get();
    if (old.empty) continue;
    const batch = db.batch();
    old.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    messages += old.size;
  }

  const expired = await db.collection("messengerStories").where("expiresAt", "<=", now).limit(300).get();
  if (!expired.empty) {
    const batch = db.batch();
    expired.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    stories = expired.size;
  }
  return NextResponse.json({ ok: true, messages, stories });
}
