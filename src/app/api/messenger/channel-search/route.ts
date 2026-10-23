import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** GET ?q= — поиск публичных каналов по началу @адреса. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_chsearch_${me.uid}`, 60, 60_000))) return fail("Слишком часто", 429);
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase().replace(/^@/, "").trim().slice(0, 24);
  if (q.length < 2) return NextResponse.json({ channels: [] });
  const snap = await adminDb().collection("messengerChats").where("handle", ">=", q).where("handle", "<=", q + "\uf8ff").limit(10).get();
  return NextResponse.json({
    channels: snap.docs
      .filter((d) => d.data().type === "channel")
      .map((d) => ({ chatId: d.id, handle: d.data().handle, title: d.data().title, description: d.data().description ?? "", photoURL: d.data().photoURL ?? null, subscribers: (d.data().members as string[]).length })),
  });
}
