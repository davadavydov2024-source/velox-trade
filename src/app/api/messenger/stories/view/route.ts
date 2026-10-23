import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { dmChatId, fail, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { id } — отметить историю просмотренной (только если есть личный чат с автором). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const { id } = await req.json().catch(() => ({ id: "" }));
  if (typeof id !== "string" || !id || id.includes("/")) return fail("id обязателен");
  const db = adminDb();
  const ref = db.collection("messengerStories").doc(id);
  const s = (await ref.get()).data();
  if (!s || s.expiresAt <= Date.now()) return fail("История не найдена", 404);
  if (s.uid !== me.uid && !(await db.collection("messengerChats").doc(dmChatId(me.uid, s.uid)).get()).exists) return fail("Нет доступа", 403);
  if (s.uid !== me.uid) await ref.update({ viewers: FieldValue.arrayUnion(me.uid) });
  return NextResponse.json({ ok: true });
}

/** GET ?id= — кто посмотрел мою историю (только автор). */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id || id.includes("/")) return fail("id обязателен");
  const db = adminDb();
  const s = (await db.collection("messengerStories").doc(id).get()).data();
  if (!s) return fail("История не найдена", 404);
  if (s.uid !== me.uid) return fail("Это не ваша история", 403);
  const viewers: string[] = (s.viewers ?? []).slice(0, 100);
  const accs = viewers.length ? await db.getAll(...viewers.map((u) => db.collection("messengerAccounts").doc(u))) : [];
  return NextResponse.json({ viewers: accs.map((a) => ({ uid: a.id, handle: a.data()?.handle ?? "", displayName: a.data()?.displayName ?? "Пользователь", photoURL: a.data()?.photoURL ?? null })), total: (s.viewers ?? []).length });
}
