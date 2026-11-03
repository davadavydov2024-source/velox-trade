import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { randomInt } from "crypto";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";
import { sendServiceMessage } from "@/lib/messenger/server";
import { NUMBER_TIERS, formatNumber, isValidDigits, numberTier, rareNumber, type NumberTier } from "@/lib/messenger/numbers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const err = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const rnd = () => randomInt(0, 1_000_000) / 1_000_000;

/** GET — последние выданные номера с именами владельцев. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const db = adminDb();
  const snap = await db.collection("messengerNumbers").orderBy("createdAt", "desc").limit(60).get();
  const rows = snap.docs.map((d) => ({ digits: d.id, ...(d.data() as { owner: string; createdAt: number }) }));
  const owners = Array.from(new Set(rows.map((r) => r.owner)));
  const accs = await Promise.all(owners.map((u) => db.collection("messengerAccounts").doc(u).get()));
  const names: Record<string, string> = {};
  accs.forEach((a, i) => { const x = a.data(); names[owners[i]] = x ? `${x.displayName} (@${x.handle})` : "—"; });
  return NextResponse.json({ numbers: rows.map((r) => ({ ...r, tier: numberTier(r.digits), ownerName: names[r.owner] })) });
}

/**
 * POST { action: "grant", uid, digits? , tier? , attach? } — выдать номер. Укажи digits (8 цифр) или tier — тогда номер сгенерируется.
 * POST { action: "revoke", digits }                      — забрать номер (убирается и из профиля владельца).
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const b = await req.json().catch(() => ({}));
  const db = adminDb();

  if (b.action === "grant") {
    const uid = typeof b.uid === "string" && b.uid && !b.uid.includes("/") ? b.uid : "";
    if (!uid) return err("Выбери пользователя");
    const accRef = db.collection("messengerAccounts").doc(uid);
    const acc = (await accRef.get()).data();
    if (!acc) return err("Пользователь не найден", 404);
    let digits: string | null = null;
    if (b.digits) {
      if (!isValidDigits(b.digits)) return err("Номер — ровно 8 цифр");
      digits = b.digits;
    } else {
      const tier: NumberTier = b.tier in NUMBER_TIERS ? b.tier : "rare";
      for (let i = 0; i < 25 && !digits; i++) {
        const cand = rareNumber(tier, rnd);
        if (!(await db.collection("messengerNumbers").doc(cand).get()).exists) digits = cand;
      }
      if (!digits) return err("Не удалось подобрать свободный номер, попробуй ещё раз");
    }
    const ref = db.collection("messengerNumbers").doc(String(digits));
    try {
      await db.runTransaction(async (tx) => {
        if ((await tx.get(ref)).exists) throw new Error("taken");
        tx.set(ref, { owner: uid, createdAt: Date.now(), grantedBy: admin.uid });
      });
    } catch (e: any) {
      if (e?.message === "taken") return err("Этот номер уже занят");
      throw e;
    }
    if (b.attach !== false && !acc.number) await accRef.update({ number: digits });
    await logAdminAccess(admin.uid, "messenger_number_grant", { uid, digits });
    await sendServiceMessage(uid, `Вам выдан номер ${formatNumber(digits)} (${NUMBER_TIERS[numberTier(digits)].label.toLowerCase()}). Он в Настройки → Мои номера: можно показать в профиле или передать.`).catch(() => {});
    return NextResponse.json({ ok: true, digits, tier: numberTier(digits) });
  }

  if (b.action === "revoke") {
    if (!isValidDigits(b.digits)) return err("Некорректный номер");
    const ref = db.collection("messengerNumbers").doc(b.digits);
    const d = (await ref.get()).data();
    if (!d) return err("Номер не найден", 404);
    await ref.delete();
    const owner = db.collection("messengerAccounts").doc(d.owner);
    if ((await owner.get()).data()?.number === b.digits) await owner.update({ number: FieldValue.delete() });
    await logAdminAccess(admin.uid, "messenger_number_revoke", { digits: b.digits, owner: d.owner });
    return NextResponse.json({ ok: true });
  }

  return err("action: grant | revoke");
}
