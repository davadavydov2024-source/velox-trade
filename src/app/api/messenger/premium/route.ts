import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { PLUS_DAYS, PLUS_PRICE_STARS, PREMIUM_DAYS, PREMIUM_PRICE_STARS, isPlus, isPremium } from "@/lib/messenger/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DAY = 24 * 60 * 60 * 1000;

/** GET — статус Mili Premium и баланс 🪙 кошелька на сайте. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const user = (await adminDb().collection("users").doc(me.uid).get()).data();
  return NextResponse.json({
    premium: isPremium(me.account), premiumUntil: me.account.premiumUntil ?? null,
    plus: isPlus(me.account), plusUntil: me.account.plusUntil ?? null, plusPriceStars: PLUS_PRICE_STARS, plusDays: PLUS_DAYS,
    priceStars: PREMIUM_PRICE_STARS, days: PREMIUM_DAYS, wallet: (user?.miliWallet as number | undefined) ?? 0,
  });
}

/** POST { action: "buy" } — купить/продлить Mili Premium за 🪙 с кошелька Velox (его пополняют на странице «Пополнение 🪙»). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_premium_${me.uid}`, 5, 60_000))) return fail("Слишком часто", 429);
  const b = await req.json().catch(() => ({}));
  if (b.action === "buy-plus") {
    const db2 = adminDb();
    const accRef2 = db2.collection("messengerAccounts").doc(me.uid), userRef2 = db2.collection("users").doc(me.uid);
    try {
      const until = await db2.runTransaction(async (tx) => {
        const [acc, user] = await Promise.all([tx.get(accRef2), tx.get(userRef2)]);
        if (((user.data()?.miliWallet as number | undefined) ?? 0) < PLUS_PRICE_STARS) throw new Error("not-enough");
        const next = Math.max(Date.now(), (acc.data()?.plusUntil as number | undefined) ?? 0) + PLUS_DAYS * DAY;
        tx.update(accRef2, { plusUntil: next });
        tx.set(userRef2, { miliWallet: FieldValue.increment(-PLUS_PRICE_STARS) }, { merge: true });
        tx.set(db2.collection("miliWalletLog").doc(), { uid: me.uid, delta: -PLUS_PRICE_STARS, type: "purchase", ref: "mili_premium_plus", at: Date.now() });
        return next;
      });
      return NextResponse.json({ ok: true, plusUntil: until });
    } catch (e: any) {
      if (e?.message === "not-enough") return NextResponse.json({ error: `Нужно ${PLUS_PRICE_STARS} 🪙 на балансе — пополни кошелёк`, needTopup: true }, { status: 402 });
      console.error("messenger plus error:", e);
      return fail("Не удалось оформить Премиум Плюс", 500);
    }
  }
  if (b.action !== "buy") return fail("action: buy | buy-plus");

  const db = adminDb();
  const accRef = db.collection("messengerAccounts").doc(me.uid);
  const userRef = db.collection("users").doc(me.uid);
  try {
    const until = await db.runTransaction(async (tx) => {
      const [acc, user] = await Promise.all([tx.get(accRef), tx.get(userRef)]);
      const wallet = (user.data()?.miliWallet as number | undefined) ?? 0;
      if (wallet < PREMIUM_PRICE_STARS) throw new Error("not-enough");
      const next = Math.max(Date.now(), (acc.data()?.premiumUntil as number | undefined) ?? 0) + PREMIUM_DAYS * DAY;
      tx.update(accRef, { premiumUntil: next });
      tx.set(userRef, { miliWallet: FieldValue.increment(-PREMIUM_PRICE_STARS) }, { merge: true });
      tx.set(db.collection("miliWalletLog").doc(), { uid: me.uid, delta: -PREMIUM_PRICE_STARS, type: "purchase", ref: "mili_premium", at: Date.now() });
      return next;
    });
    return NextResponse.json({ ok: true, premiumUntil: until });
  } catch (e: any) {
    if (e?.message === "not-enough") return NextResponse.json({ error: `Нужно ${PREMIUM_PRICE_STARS} 🪙 на балансе — пополни кошелёк на странице «Пополнение 🪙»`, needTopup: true }, { status: 402 });
    console.error("messenger premium error:", e);
    return fail("Не удалось оформить Mili Premium", 500);
  }
}
