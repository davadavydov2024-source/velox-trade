import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

/** GET ?q=ник — поиск людей по началу @handle (до 10). */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_search_${me.uid}`, 60, 60_000))) return fail("Слишком часто", 429);
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase().replace(/^@/, "").trim().slice(0, 24);
  if (q.length < 2) return NextResponse.json({ users: [] });
  const snap = await adminDb().collection("messengerAccounts").where("handle", ">=", q).where("handle", "<=", q + "\uf8ff").limit(15).get();
  const found = snap.docs.map((d) => d.data());
  // коллекционный @юзернейм: ищем владельца по точному совпадению, даже если это не его основной ник
  if (/^[a-z][a-z0-9_]{1,23}$/.test(q) && !found.some((a) => a.handle === q)) {
    const h = (await adminDb().collection("messengerHandles").doc(q).get()).data();
    if (h?.premium && typeof h.uid === "string") { const o = (await adminDb().collection("messengerAccounts").doc(h.uid).get()).data(); if (o) found.unshift(o); }
  }
  const users = found
    .filter((a) => !a.banned && a.uid !== me.uid && a.uid !== "miligram")
    .slice(0, 10)
    .map((a) => ({ uid: a.uid, handle: a.handle, displayName: a.displayName, photoURL: a.photoURL ?? null, verified: !!a.verified }));
  return NextResponse.json({ users });
}
