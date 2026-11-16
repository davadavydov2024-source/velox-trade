import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { isAdminUid, logAdminAccess, requireAdmin } from "@/lib/adminGuard";
import { sendServiceMessage } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const err = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });

/** GET — список помощников. */
export async function GET(req: NextRequest) {
  const a = await requireAdmin(req);
  if ("error" in a) return a.error;
  const snap = await adminDb().collection("messengerMusicWorkers").orderBy("addedAt", "desc").limit(200).get();
  return NextResponse.json({ workers: snap.docs.map((d) => ({ uid: d.id, ...d.data() })) });
}

/** POST { action: "add", handle } | { action: "remove", uid } — назначить / снять помощника. */
export async function POST(req: NextRequest) {
  const a = await requireAdmin(req);
  if ("error" in a) return a.error;
  const b = await req.json().catch(() => ({}));
  const db = adminDb();

  if (b.action === "add") {
    const handle = typeof b.handle === "string" ? b.handle.trim().replace(/^@/, "").toLowerCase() : "";
    if (!/^[a-z0-9_]{4,24}$/.test(handle)) return err("Введи @username пользователя (4–24 символа: a-z, 0-9, _)");
    const s = await db.collection("messengerAccounts").where("handle", "==", handle).limit(1).get();
    if (s.empty) return err("Пользователь с таким @username не найден", 404);
    const uid = s.docs[0].id;
    const acc = s.docs[0].data();
    if (isAdminUid(uid)) return err("Это админ — ему и так можно");
    await db.collection("messengerMusicWorkers").doc(uid).set({ handle, displayName: String(acc.displayName ?? handle), addedAt: Date.now(), addedBy: a.uid });
    await logAdminAccess(a.uid, "messenger_music_worker_add", { workerUid: uid });
    await sendServiceMessage(uid, "🎵 Тебя назначили помощником по музыке!\nТеперь в разделе «Музыка» (Настройки → Музыка) у тебя есть кнопка «Добавить песни».").catch(() => {});
    return NextResponse.json({ ok: true, uid });
  }

  if (b.action === "remove") {
    if (typeof b.uid !== "string" || !b.uid || b.uid.includes("/")) return err("Некорректный пользователь");
    await db.collection("messengerMusicWorkers").doc(b.uid).delete();
    await logAdminAccess(a.uid, "messenger_music_worker_remove", { workerUid: b.uid });
    return NextResponse.json({ ok: true });
  }
  return err("action: add | remove");
}
