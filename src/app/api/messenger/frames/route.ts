import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { FRAME_COLORS, frameById } from "@/lib/messenger/frames";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — какие рамки куплены и какая надета. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const d = (await adminDb().collection("messengerFrames").doc(me.uid).get()).data();
  return NextResponse.json({ owned: (d?.owned as string[] | undefined) ?? [], equipped: me.account.frame ?? null });
}

/**
 * POST { action: "buy", id }                    — купить рамку за ⭐ (списывается с кошелька).
 * POST { action: "equip", id | null, color? }   — надеть купленную рамку (id: null — снять).
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const db = adminDb();
  const ownedRef = db.collection("messengerFrames").doc(me.uid);

  if (b.action === "buy") {
    if (!(await rateLimit(`msgr_frame_buy_${me.uid}`, 20, 60_000))) return fail("Слишком часто", 429);
    const f = frameById(b.id);
    if (!f) return fail("Такой рамки нет", 404);
    try {
      await db.runTransaction(async (tx) => {
        const [o, u] = await Promise.all([tx.get(ownedRef), tx.get(db.collection("users").doc(me.uid))]);
        if (((o.data()?.owned as string[] | undefined) ?? []).includes(f.id)) throw new Error("already");
        const have = (u.data()?.starsWallet as number | undefined) ?? 0;
        if (have < f.price) throw new Error("not-enough");
        tx.set(db.collection("users").doc(me.uid), { starsWallet: FieldValue.increment(-f.price) }, { merge: true });
        tx.set(db.collection("starsWalletLog").doc(), { uid: me.uid, delta: -f.price, type: "frame_buy", ref: f.id, at: Date.now() });
        tx.set(ownedRef, { owned: FieldValue.arrayUnion(f.id) }, { merge: true });
      });
    } catch (e: any) {
      if (e?.message === "already") return fail("Эта рамка у вас уже есть");
      if (e?.message === "not-enough") return NextResponse.json({ error: "Не хватает ⭐ на балансе", needTopup: true }, { status: 402 });
      console.error("frame buy error:", e);
      return fail("Не удалось купить рамку", 500);
    }
    return NextResponse.json({ ok: true });
  }

  if (b.action === "equip") {
    const accRef = db.collection("messengerAccounts").doc(me.uid);
    if (b.id === null || b.id === undefined || b.id === "") {
      await accRef.update({ frame: FieldValue.delete() });
      return NextResponse.json({ ok: true });
    }
    const f = frameById(b.id);
    if (!f) return fail("Такой рамки нет", 404);
    const owned = (((await ownedRef.get()).data()?.owned as string[] | undefined) ?? []).includes(f.id);
    if (!owned) return fail("Сначала купите эту рамку", 403);
    const color = typeof b.color === "string" && FRAME_COLORS.includes(b.color) ? b.color : f.defaultColor;
    await accRef.update({ frame: { id: f.id, color } });
    return NextResponse.json({ ok: true });
  }

  return fail("action: buy | equip");
}
