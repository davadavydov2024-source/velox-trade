import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";
import { sendServiceMessage } from "@/lib/messenger/server";
import { TAG_MAX, VERIFY_KINDS, isVerifyKind, verifyMeta } from "@/lib/messenger/marks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const err = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });

/**
 * GET ?handle=@канал — найти канал/группу по @адресу (для вкладки «Метки»).
 * POST { target: "user" | "chat", uid? | handle?, kind: "verified"|"official"|"major"|"trusted"|null, text?, tag? }
 *   — выдать (или снять, kind=null) галочку, подпись под профилем и метку рядом с именем людям и каналам. Человек получает сообщение от «MiliGram Push».
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const h = (req.nextUrl.searchParams.get("handle") ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!h) return err("Укажи @адрес");
  const snap = await adminDb().collection("messengerChats").where("handle", "==", h).limit(1).get();
  if (snap.empty) return err("Канал или группа с таким адресом не найдены", 404);
  const d = snap.docs[0].data();
  return NextResponse.json({ chat: { id: snap.docs[0].id, type: d.type, title: d.title ?? "", handle: d.handle, verifyKind: d.verifyKind ?? null, verifyText: d.verifyText ?? "", tag: d.tag ?? "", tagText: d.tagText ?? "" } });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const b = await req.json().catch(() => ({}));
  const db = adminDb();
  const kind = b.kind === null || b.kind === "" || b.kind === undefined ? null : b.kind;
  if (kind !== null && !isVerifyKind(kind)) return err("Неизвестный вид галочки");
  const text = typeof b.text === "string" ? b.text.trim().slice(0, 200) : "";
  const tag = typeof b.tag === "string" ? b.tag.trim().slice(0, TAG_MAX) : "";
  const tagText = typeof b.tagText === "string" ? b.tagText.trim().slice(0, 200) : "";
  const patch: Record<string, unknown> = {
    verifyKind: kind ?? FieldValue.delete(),
    verifyText: kind && text ? text : FieldValue.delete(),
    tag: tag || FieldValue.delete(),
    tagText: tag && tagText ? tagText : FieldValue.delete(),
  };

  if (b.target === "chat") {
    const h = String(b.handle ?? "").trim().replace(/^@/, "").toLowerCase();
    const snap = await db.collection("messengerChats").where("handle", "==", h).limit(1).get();
    if (snap.empty) return err("Канал или группа не найдены", 404);
    await snap.docs[0].ref.update(patch);
    await logAdminAccess(admin.uid, "messenger_mark_chat", { chat: snap.docs[0].id, kind, tag });
    return NextResponse.json({ ok: true });
  }

  const uid = typeof b.uid === "string" && b.uid && !b.uid.includes("/") ? b.uid : "";
  if (!uid) return err("uid обязателен");
  const ref = db.collection("messengerAccounts").doc(uid);
  if (!(await ref.get()).exists) return err("Аккаунт не найден", 404);
  await ref.update({ ...patch, verified: kind !== null });
  await logAdminAccess(admin.uid, "messenger_mark_user", { targetUid: uid, kind, tag });
  if (kind || tag) {
    const parts = [kind ? `галочка «${verifyMeta(kind).label}»` : "", tag ? `метка «${tag}»` : ""].filter(Boolean).join(" и ");
    await sendServiceMessage(uid, `✅ Вам присвоена ${parts}. Она уже видна в вашем профиле.`).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
