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
  const users = snap.docs
    .map((d) => d.data())
    .filter((a) => !a.banned && a.uid !== me.uid && a.uid !== "miligram")
    .slice(0, 10)
    .map((a) => ({ uid: a.uid, handle: a.handle, displayName: a.displayName, photoURL: a.photoURL ?? null, verified: !!a.verified }));
  return NextResponse.json({ users });
}
