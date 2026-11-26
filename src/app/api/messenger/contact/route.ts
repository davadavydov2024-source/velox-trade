import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { fail, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ref = (me: string, uid: string) => adminDb().collection("messengerContacts").doc(me).collection("contacts").doc(uid);
const okUid = (u: unknown): u is string => typeof u === "string" && !!u && !u.includes("/");

/** GET ?uid= — моё имя и заметка для этого человека (видны только мне). */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const uid = req.nextUrl.searchParams.get("uid");
  // без uid — все мои переименования разом (для списка чатов, шапки и имён в группах)
  if (uid === null) {
    const snap = await adminDb().collection("messengerContacts").doc(me.uid).collection("contacts").limit(2000).get();
    const contacts: Record<string, { firstName: string; lastName: string }> = {};
    snap.docs.forEach((d) => {
      const v = d.data();
      if (v?.firstName || v?.lastName) contacts[d.id] = { firstName: v.firstName ?? "", lastName: v.lastName ?? "" };
    });
    return NextResponse.json({ contacts });
  }
  if (!okUid(uid)) return fail("uid обязателен");
  const d = (await ref(me.uid, uid).get()).data();
  return NextResponse.json({ firstName: d?.firstName ?? "", lastName: d?.lastName ?? "", note: d?.note ?? "" });
}

/** POST { uid, firstName?, lastName?, note? } — переименовать контакт и оставить заметку (только для себя). Пустые значения очищают запись. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  if (!okUid(b.uid)) return fail("uid обязателен");
  const clean = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
  const data = { firstName: clean(b.firstName, 40), lastName: clean(b.lastName, 40), note: clean(b.note, 200) };
  if (!data.firstName && !data.lastName && !data.note) await ref(me.uid, b.uid).delete();
  else await ref(me.uid, b.uid).set(data);
  return NextResponse.json({ ok: true });
}
