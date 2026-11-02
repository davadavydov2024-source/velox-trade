import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger, sendServiceMessage } from "@/lib/messenger/server";
import { formatNumber, isValidDigits, numberTier } from "@/lib/messenger/numbers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — мои номера и тот, что сейчас показан в профиле. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const snap = await adminDb().collection("messengerNumbers").where("owner", "==", me.uid).limit(100).get();
  const numbers = snap.docs
    .map((d) => ({ digits: d.id, createdAt: (d.data().createdAt as number) ?? 0 }))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((n) => ({ ...n, tier: numberTier(n.digits) }));
  return NextResponse.json({ numbers, attached: me.account.number ?? null });
}

/**
 * POST { action: "attach", digits }            — показать свой номер в профиле.
 * POST { action: "detach" }                    — убрать номер из профиля (он остаётся у владельца).
 * POST { action: "transfer", digits, toUid }   — передать номер другому человеку.
 */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  const db = adminDb();
  const myAcc = db.collection("messengerAccounts").doc(me.uid);

  if (b.action === "detach") {
    await myAcc.update({ number: FieldValue.delete() });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "attach") {
    if (!isValidDigits(b.digits)) return fail("Некорректный номер");
    const d = (await db.collection("messengerNumbers").doc(b.digits).get()).data();
    if (!d || d.owner !== me.uid) return fail("Этот номер вам не принадлежит", 403);
    await myAcc.update({ number: b.digits });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "transfer") {
    if (!(await rateLimit(`msgr_num_tr_${me.uid}`, 10, 60_000))) return fail("Слишком часто, подождите", 429);
    const toUid = typeof b.toUid === "string" && b.toUid && !b.toUid.includes("/") ? b.toUid : "";
    if (!isValidDigits(b.digits) || !toUid) return fail("Выберите номер и получателя");
    if (toUid === me.uid) return fail("Нельзя передать номер самому себе");
    const target = (await db.collection("messengerAccounts").doc(toUid).get()).data();
    if (!target || target.banned) return fail("Пользователь недоступен", 404);
    const ref = db.collection("messengerNumbers").doc(b.digits);
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists || snap.data()?.owner !== me.uid) throw new Error("not-owner");
        tx.update(ref, { owner: toUid, transferredAt: Date.now(), from: me.uid });
      });
    } catch (e: any) {
      if (e?.message === "not-owner") return fail("Этот номер вам не принадлежит", 403);
      console.error("number transfer error:", e);
      return fail("Не удалось передать номер", 500);
    }
    // если номер стоял у меня в профиле — снимаем
    if (me.account.number === b.digits) await myAcc.update({ number: FieldValue.delete() }).catch(() => {});
    await sendServiceMessage(toUid, `Вам передали номер ${formatNumber(b.digits)} от ${me.account.displayName}. Показать его в профиле можно в Настройки → Мои номера.`).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  return fail("action: attach | detach | transfer");
}
