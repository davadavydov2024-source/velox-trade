import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPEAT_MS = 6 * 60 * 60_000; // один человек увеличивает счётчик чужого профиля не чаще раза в 6 часов

/** POST { uid } — «я посмотрел профиль uid». Счётчик просмотров растёт на 1; свои просмотры и частые повторы не считаются. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const uid = typeof b.uid === "string" && b.uid && !b.uid.includes("/") ? b.uid : "";
  if (!uid) return fail("uid обязателен");
  if (uid === me.uid) return NextResponse.json({ ok: true });
  if (!(await rateLimit(`msgr_pview_${me.uid}`, 60, 60_000))) return NextResponse.json({ ok: true });
  const db = adminDb();
  const ref = db.collection("messengerProfileViews").doc(`${uid}_${me.uid}`);
  const acc = db.collection("messengerAccounts").doc(uid);
  const now = Date.now();
  try {
    await db.runTransaction(async (tx) => {
      const [v, a] = await Promise.all([tx.get(ref), tx.get(acc)]);
      if (!a.exists) return;
      if (v.exists && now - ((v.data()?.at as number) ?? 0) < REPEAT_MS) return;
      tx.set(ref, { at: now });
      tx.update(acc, { views: FieldValue.increment(1) });
    });
  } catch {}
  return NextResponse.json({ ok: true });
}
