import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { datingGreeting, ensureDatingBot, ensureDatingChat } from "@/lib/messenger/dating";
import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

/** POST — открыть чат с официальным ботом знакомств (создаётся при первом обращении, бот сам здоровается). → { chatId } */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_dating_open_${me.uid}`, 20, 60_000))) return fail("Слишком часто", 429);
  await ensureDatingBot();
  const existed = (await adminDb().collection("messengerChats").doc([me.uid, "velox_dating"].sort().join("_")).get()).exists;
  const chat = await ensureDatingChat(me.uid);
  if (!existed) await datingGreeting(me.uid);
  return NextResponse.json({ chatId: chat.id });
}
