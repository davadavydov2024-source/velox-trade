import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
const DAY = 86400_000;

/** POST { code } — активировать промокод: Mili Premium на N дней. Один код — один раз на человека. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_promo_${me.uid}`, 6, 60_000))) return fail("Слишком много попыток, подожди минуту", 429);
  const b = await req.json().catch(() => ({}));
  const code = typeof b.code === "string" ? b.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32) : "";
  if (code.length < 4) return fail("Введи промокод");
  const db = adminDb();
  const ref = db.collection("messengerPromoCodes").doc(code);
  const accRef = db.collection("messengerAccounts").doc(me.uid);
  try {
    const days = await db.runTransaction(async (tx) => {
      const [snap, use, acc] = await Promise.all([tx.get(ref), tx.get(ref.collection("uses").doc(me.uid)), tx.get(accRef)]);
      const d = snap.data();
      if (!d || d.disabled) throw new Error("Такого промокода нет");
      if (d.expiresAt && d.expiresAt < Date.now()) throw new Error("Срок действия промокода закончился");
      if (use.exists) throw new Error("Ты уже активировал этот промокод");
      if (d.maxUses && (d.used ?? 0) >= d.maxUses) throw new Error("Промокод уже использован максимальное число раз");
      const base = Math.max(Date.now(), (acc.data()?.premiumUntil as number | undefined) ?? 0);
      tx.update(accRef, { premiumUntil: base + d.days * DAY });
      tx.update(ref, { used: (d.used ?? 0) + 1 });
      tx.set(ref.collection("uses").doc(me.uid), { at: Date.now() });
      return d.days as number;
    });
    return NextResponse.json({ ok: true, days });
  } catch (e: any) {
    return fail(e?.message || "Не удалось активировать", 400);
  }
}

