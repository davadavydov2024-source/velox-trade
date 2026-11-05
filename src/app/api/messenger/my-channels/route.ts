import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — все мои каналы (где я создатель или админ), публичные и закрытые: для выбора канала в профиле. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const snap = await adminDb().collection("messengerChats").where("members", "array-contains", me.uid).limit(400).get();
  const channels = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) }))
    .filter((c) => c.type === "channel" && (c.createdBy === me.uid || (c.admins ?? []).includes(me.uid)))
    .map((c) => ({
      chatId: c.id as string,
      title: (c.title as string) ?? "Канал",
      photoURL: (c.photoURL as string | undefined) ?? null,
      handle: (c.handle as string | undefined) ?? null,
      isPrivate: !c.handle || !!c.joinByRequest,
      subscribers: ((c.members as string[]) ?? []).length,
    }))
    .sort((a, b) => b.subscribers - a.subscribers);
  return NextResponse.json({ channels, selected: me.account.profileChannel ?? null });
}
