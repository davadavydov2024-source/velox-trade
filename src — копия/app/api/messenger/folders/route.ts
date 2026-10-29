import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { limitsFor } from "@/lib/messenger/premium";

export const runtime = "nodejs";
const MAX_FOLDERS = 10;
const TYPES = ["dm", "group", "channel", "unread"];

/** POST { action: "create"|"update"|"delete", id?, name?, emoji?, order?, includeTypes?, chatIds? } — папки чатов. Читать — напрямую из Firestore. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const col = adminDb().collection("messengerUserFolders").doc(me.uid).collection("folders");

  const data: Record<string, unknown> = {};
  if (b.action !== "delete") {
    if ("name" in b || b.action === "create") {
      const name = String(b.name ?? "").trim();
      if (name.length < 1 || name.length > 24) return fail("Название папки — от 1 до 24 символов");
      data.name = name;
    }
    if ("emoji" in b) data.emoji = String(b.emoji ?? "").slice(0, 8);
    if ("order" in b && typeof b.order === "number") data.order = Math.round(b.order);
    if ("includeTypes" in b) data.includeTypes = Array.isArray(b.includeTypes) ? b.includeTypes.filter((t: unknown) => typeof t === "string" && TYPES.includes(t)) : [];
    if ("chatIds" in b) data.chatIds = Array.isArray(b.chatIds) ? b.chatIds.filter((c: unknown) => typeof c === "string" && c && !c.includes("/")).slice(0, 200) : [];
  }

  if (b.action === "create") {
    const count = (await col.count().get()).data().count;
    const max = limitsFor(me.account).folders;
    if (count >= max) return fail(`Не больше ${max} папок (с Mili Premium — больше)`);
    const ref = col.doc();
    await ref.set({ order: count, includeTypes: [], chatIds: [], ...data });
    return NextResponse.json({ id: ref.id });
  }
  if (typeof b.id !== "string" || !b.id || b.id.includes("/")) return fail("id обязателен");
  const ref = col.doc(b.id);
  if (!(await ref.get()).exists) return fail("Папка не найдена", 404);
  if (b.action === "update") {
    if (Object.keys(data).length === 0) return fail("Нечего менять");
    await ref.update(data);
  } else if (b.action === "delete") {
    await ref.delete();
  } else return fail("Действие: create, update или delete");
  return NextResponse.json({ ok: true });
}
