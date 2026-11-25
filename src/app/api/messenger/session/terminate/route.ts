import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { fail, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";

/**
 * POST { id } — завершить один сеанс; { others: true, currentDeviceId } — все, кроме текущего;
 * { everything: true } — все сразу и сбросить вход везде (в том числе на сайте Velox: придётся войти заново).
 * Завершённое устройство получает 401 { revoked:true } на следующем запросе (клиент должен выйти).
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const db = adminDb();
  const col = db.collection("messengerSessions").doc(me.uid).collection("list");

  if (typeof b.id === "string" && b.id && !b.id.includes("/")) {
    await col.doc(b.id).set({ revoked: true, revokedAt: Date.now() }, { merge: true });
    return NextResponse.json({ ok: true, terminated: 1 });
  }
  if (b.others === true || b.everything === true) {
    const all = await col.where("revoked", "==", false).limit(100).get();
    const keep = b.everything === true ? "" : String(b.currentDeviceId ?? "");
    if (b.others === true && !keep) return fail("Укажи currentDeviceId — какой сеанс оставить");
    const batch = db.batch();
    let n = 0;
    all.docs.forEach((d) => { if (d.id !== keep) { batch.update(d.ref, { revoked: true, revokedAt: Date.now() }); n++; } });
    await batch.commit();
    if (b.everything === true) await adminAuth().revokeRefreshTokens(me.uid).catch(() => {});
    return NextResponse.json({ ok: true, terminated: n });
  }
  return fail("Укажи id, others или everything");
}
