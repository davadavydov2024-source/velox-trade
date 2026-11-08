import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { rollyCreatePayment, rollyGetPayment, RollyPayError, ROLLYPAY_PENDING_TIMEOUT_MS } from "@/lib/rollypay";
import { fail, requireMessenger } from "@/lib/messenger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 1 монета 🪙 = 1 ₽. Хочешь другой курс — поменяй COINS_PER_RUB. */
const COINS_PER_RUB = 1;
const MIN_RUB = 10, MAX_RUB = 15000;

type Order = { uid: string; rub: number; coins: number; status: "pending" | "paid" | "cancelled"; rollyPaymentId: string; createdAt: number };

/** Начисляет монеты за оплаченный счёт — ровно один раз. */
async function credit(orderId: string): Promise<boolean> {
  const db = adminDb();
  const ref = db.collection("messengerTopups").doc(orderId);
  let ok = false;
  await db.runTransaction(async (tx) => {
    const o = (await tx.get(ref)).data() as Order | undefined;
    if (!o || o.status === "paid") return;
    tx.update(ref, { status: "paid", paidAt: Date.now() });
    tx.set(db.collection("users").doc(o.uid), { miliWallet: FieldValue.increment(o.coins) }, { merge: true });
    tx.set(db.collection("miliWalletLog").doc(), { uid: o.uid, delta: o.coins, type: "topup", ref: orderId, at: Date.now() });
    ok = true;
  });
  return ok;
}

/** GET — сверить неоплаченные счета с RollyPay и начислить оплаченные. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const db = adminDb();
  const snap = await db.collection("messengerTopups").where("uid", "==", me.uid).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Order) })).filter((o) => o.status === "pending").sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  let credited = 0;
  for (const o of rows) {
    try {
      const v = await rollyGetPayment(o.rollyPaymentId);
      if (v.status === "paid" && Number(v.amount) >= o.rub) { if (await credit(o.id)) credited += o.coins; }
      else if (Date.now() - o.createdAt > ROLLYPAY_PENDING_TIMEOUT_MS) await db.collection("messengerTopups").doc(o.id).update({ status: "cancelled", cancelledAt: Date.now() });
    } catch (e) { console.error("messenger topup check:", o.id, e); }
  }
  return NextResponse.json({ credited });
}

/** POST { amount } — сколько монет хочешь купить. Создаёт счёт RollyPay в ₽ и возвращает ссылку на оплату. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_topup_${me.uid}`, 8, 60_000))) return fail("Слишком часто", 429);
  const b = await req.json().catch(() => ({}));
  const coins = Number(b.amount);
  const rub = coins / COINS_PER_RUB;
  if (!Number.isInteger(coins) || !Number.isInteger(rub) || rub < MIN_RUB || rub > MAX_RUB) return fail(`Сумма — целое число монет 🪙 от ${MIN_RUB * COINS_PER_RUB} до ${MAX_RUB * COINS_PER_RUB}`);
  const orderId = `mgt_${me.uid.slice(0, 8)}_${Date.now()}`;
  const origin = req.headers.get("origin") || req.nextUrl.origin;
  try {
    const { payUrl, paymentId } = await rollyCreatePayment({ amount: rub, orderId, description: `Пополнение кошелька MiliGram: ${coins} монет`, redirectUrl: `${origin}/?wallet_paid=${orderId}` });
    await adminDb().collection("messengerTopups").doc(orderId).set({ uid: me.uid, rub, coins, status: "pending", paymentUrl: payUrl, rollyPaymentId: paymentId, createdAt: Date.now() });
    return NextResponse.json({ ok: true, url: payUrl, orderId, rub });
  } catch (e) {
    if (e instanceof RollyPayError) { console.error("messenger topup create:", e.message); return fail(e.message, 502); }
    console.error("messenger topup error:", e);
    return fail("Не удалось создать счёт", 500);
  }
}
