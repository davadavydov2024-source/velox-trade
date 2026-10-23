import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { PREMIUM_DAYS, PREMIUM_PRICE_STARS, isPremium } from "@/lib/messenger/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DAY = 24 * 60 * 60 * 1000;

/** GET — статус Mili Premium и баланс ⭐ кошелька на сайте. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const user = (await adminDb().collection("users").doc(me.uid).get()).data();
  return NextResponse.json({
    premium: isPremium(me.account), premiumUntil: me.account.premiumUntil ?? null,
    priceStars: PREMIUM_PRICE_STARS, days: PREMIUM_DAYS, wallet: (user?.starsWallet as number | undefined) ?? 0,
  });
}

/** POST { action: "buy" } — купить/продлить Mili Premium за ⭐ с кошелька Velox (его пополняют на странице «Пополнение ⭐»). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_premium_${me.uid}`, 5, 60_000))) return fail("Слишком часто", 429);
  const b = await req.json().catch(() => ({}));
  if (b.action !== "buy") return fail("action: buy");

  const db = adminDb();
  const accRef = db.collection("messengerAccounts").doc(me.uid);
  const userRef = db.collection("users").doc(me.uid);
  try {
    const until = await db.runTransaction(async (tx) => {
      const [acc, user] = await Promise.all([tx.get(accRef), tx.get(userRef)]);
      const wallet = (user.data()?.starsWallet as number | undefined) ?? 0;
      if (wallet < PREMIUM_PRICE_STARS) throw new Error("not-enough");
      const next = Math.max(Date.now(), (acc.data()?.premiumUntil as number | undefined) ?? 0) + PREMIUM_DAYS * DAY;
      tx.update(accRef, { premiumUntil: next });
      tx.set(userRef, { starsWallet: FieldValue.increment(-PREMIUM_PRICE_STARS) }, { merge: true });
      tx.set(db.collection("starsWalletLog").doc(), { uid: me.uid, delta: -PREMIUM_PRICE_STARS, type: "purchase", ref: "mili_premium", at: Date.now() });
      return next;
    });
    return NextResponse.json({ ok: true, premiumUntil: until });
  } catch (e: any) {
    if (e?.message === "not-enough") return NextResponse.json({ error: `Нужно ${PREMIUM_PRICE_STARS} ⭐ на балансе — пополни кошелёк на странице «Пополнение ⭐»`, needTopup: true }, { status: 402 });
    console.error("messenger premium error:", e);
    return fail("Не удалось оформить Mili Premium", 500);
  }
}
