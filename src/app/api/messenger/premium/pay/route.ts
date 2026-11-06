import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { rollyCreatePayment, rollyGetPayment, RollyPayError, ROLLYPAY_PENDING_TIMEOUT_MS } from "@/lib/rollypay";
import { fail, requireMessenger, sendServiceMessage } from "@/lib/messenger/server";
import { DOCS_VERSION, PREMIUM_PLANS, type PremiumPlan } from "@/lib/messenger/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DAY = 24 * 60 * 60 * 1000;

type Order = { uid: string; plan: PremiumPlan; amount: number; days: number; status: "pending" | "paid" | "cancelled"; rollyPaymentId: string; createdAt: number; paidAt?: number };

/** Начисляет подписку за оплаченный заказ — ровно один раз (транзакция). */
async function credit(orderId: string): Promise<boolean> {
  const db = adminDb();
  const ref = db.collection("messengerPayments").doc(orderId);
  let done: Order | null = null;
  await db.runTransaction(async (tx) => {
    const o = (await tx.get(ref)).data() as Order | undefined;
    if (!o || o.status === "paid") return;
    const accRef = db.collection("messengerAccounts").doc(o.uid);
    const acc = (await tx.get(accRef)).data() ?? {};
    const field = o.plan === "plus" ? "plusUntil" : "premiumUntil";
    const until = Math.max(Date.now(), (acc[field] as number | undefined) ?? 0) + o.days * DAY;
    tx.update(accRef, { [field]: until });
    tx.update(ref, { status: "paid", paidAt: Date.now() });
    done = o;
  });
  const o = done as Order | null;
  if (o) await sendServiceMessage(o.uid, `✅ Оплата получена: ${PREMIUM_PLANS[o.plan].title} на ${o.days} дн. активирован. Спасибо, что вы с нами!`).catch(() => {});
  return !!o;
}

/** GET — проверить оплату: сверяем незавершённые заказы с RollyPay, начисляем оплаченные, возвращаем последние заказы. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const db = adminDb();
  const snap = await db.collection("messengerPayments").where("uid", "==", me.uid).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Order) })).sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  let credited = 0;
  for (const o of rows) {
    if (o.status !== "pending") continue;
    try {
      const v = await rollyGetPayment(o.rollyPaymentId);
      if (v.status === "paid" && Number(v.amount) >= o.amount) { if (await credit(o.id)) credited++; o.status = "paid"; }
      else if (Date.now() - o.createdAt > ROLLYPAY_PENDING_TIMEOUT_MS) { await db.collection("messengerPayments").doc(o.id).update({ status: "cancelled", cancelledAt: Date.now() }); o.status = "cancelled"; }
    } catch (e) { console.error("premium pay check:", o.id, e); }
  }
  return NextResponse.json({ credited, orders: rows.map((o) => ({ orderId: o.id, plan: o.plan, amount: o.amount, status: o.status, createdAt: o.createdAt })) });
}

/** POST { plan: "premium" | "plus", accept: true } — создаёт счёт в RollyPay, возвращает ссылку на оплату. Без принятия условий платёж не создаётся. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_pay_${me.uid}`, 6, 60_000))) return fail("Слишком часто", 429);
  const b = await req.json().catch(() => ({}));
  const plan = b.plan as PremiumPlan;
  if (!(plan in PREMIUM_PLANS)) return fail("Неизвестный тариф");
  if (b.accept !== true) return fail("Нужно принять условия подписки, соглашение и политику конфиденциальности");
  const p = PREMIUM_PLANS[plan];
  const orderId = `mgp_${me.uid.slice(0, 8)}_${Date.now()}`;
  const origin = req.headers.get("origin") || req.nextUrl.origin;
  try {
    const { payUrl, paymentId } = await rollyCreatePayment({ amount: p.rub, orderId, description: `${p.title} на ${p.days} дн. — MiliGram`, redirectUrl: `${origin}/?premium_paid=${orderId}` });
    await adminDb().collection("messengerPayments").doc(orderId).set({
      uid: me.uid, plan, amount: p.rub, days: p.days, status: "pending", paymentUrl: payUrl, rollyPaymentId: paymentId,
      createdAt: Date.now(), acceptedAt: Date.now(), docsVersion: DOCS_VERSION,
    });
    return NextResponse.json({ url: payUrl, orderId });
  } catch (e) {
    if (e instanceof RollyPayError) { console.error("premium pay create:", e.message); return fail(e.message, 502); }
    console.error("premium pay error:", e);
    return fail("Не удалось создать платёж. Попробуй позже.", 500);
  }
}
