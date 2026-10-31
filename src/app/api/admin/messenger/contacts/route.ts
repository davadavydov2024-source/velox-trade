import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";
import type { MessengerChat } from "@/lib/messenger/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?uid=…&reason=… — контакты пользователя (с кем у него личные чаты). Только имена и @username, без текста переписок.
 * Нужна причина (от 10 символов); каждый просмотр пишется в adminAuditLog (action: messenger_contacts).
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const sp = req.nextUrl.searchParams;
  const uid = sp.get("uid") ?? "";
  const reason = (sp.get("reason") ?? "").trim().slice(0, 300);
  if (!uid || uid.includes("/")) return NextResponse.json({ error: "Укажи uid" }, { status: 400 });
  if (reason.length < 10) return NextResponse.json({ error: "Укажи причину (не короче 10 символов)" }, { status: 400 });
  const db = adminDb();
  const snap = await db.collection("messengerChats").where("members", "array-contains", uid).limit(400).get();
  const chats = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessengerChat & { service?: boolean }).filter((c) => c.type === "dm" && !c.service && new Set(c.members).size === 2);
  const peers = chats.map((c) => ({ uid: c.members.find((m) => m !== uid)!, at: c.updatedAt ?? 0 }));
  const docs = peers.length ? await db.getAll(...peers.map((p) => db.collection("messengerAccounts").doc(p.uid))) : [];
  const contacts = docs.map((d, i) => { const a = d.data(); return { uid: peers[i].uid, displayName: a?.displayName ?? "", handle: a?.handle ?? "", lastAt: peers[i].at }; }).sort((a, b) => b.lastAt - a.lastAt);
  await logAdminAccess(admin.uid, "messenger_contacts", { targetUid: uid, reason, count: contacts.length });
  return NextResponse.json({ contacts });
}
