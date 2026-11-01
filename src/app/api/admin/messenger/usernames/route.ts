import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";
import { PRICE_MAX, addToShop, generateNames, validName, type UsernameDoc } from "@/lib/messenger/usernames";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const err = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });

/** GET — что сейчас в магазине и сколько продано. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const all = (await adminDb().collection("messengerUsernames").limit(1000).get()).docs.map((d) => d.data() as UsernameDoc);
  const shop = all.filter((x) => !x.ownerUid).sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name)).map((x) => ({ name: x.name, price: x.shopPrice }));
  return NextResponse.json({ shop, owned: all.filter((x) => x.ownerUid).length, listed: all.filter((x) => x.ownerUid && (x.salePrice || x.rentPerDay)).length });
}

/**
 * POST { action: "generate", count } — придумать свободные имена (правила и словари);
 *      { action: "add", items: [{name, price}] } — добавить в магазин;
 *      { action: "price", name, price } — сменить цену непроданного;
 *      { action: "remove", name } — убрать непроданное из магазина.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const b = await req.json().catch(() => ({}));
  const db = adminDb();
  if (b.action === "generate") {
    const count = Math.min(40, Math.max(1, Math.floor(Number(b.count) || 20)));
    return NextResponse.json({ names: await generateNames(count) });
  }
  if (b.action === "add") {
    if (!Array.isArray(b.items) || !b.items.length) return err("Нечего добавлять");
    const r = await addToShop(b.items);
    await logAdminAccess(admin.uid, "messenger_username_add", { count: r.added.length });
    return NextResponse.json(r);
  }
  const name = typeof b.name === "string" ? b.name.toLowerCase() : "";
  if (!validName(name)) return err("Некорректный юзернейм");
  if (b.action === "price") {
    const price = Math.floor(Number(b.price));
    if (!(price >= 1 && price <= PRICE_MAX)) return err("Некорректная цена");
    const ref = db.collection("messengerUsernames").doc(name);
    const s = (await ref.get()).data() as UsernameDoc | undefined;
    if (!s || s.ownerUid) return err("Юзернейм уже продан", 409);
    await ref.update({ shopPrice: price });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "remove") {
    const ref = db.collection("messengerUsernames").doc(name);
    try {
      await db.runTransaction(async (tx) => {
        const s = (await tx.get(ref)).data() as UsernameDoc | undefined;
        if (!s || s.ownerUid) throw new Error("sold");
        tx.delete(ref);
        tx.delete(db.collection("messengerHandles").doc(name));
      });
    } catch { return err("Юзернейм уже продан или не найден", 409); }
    await logAdminAccess(admin.uid, "messenger_username_remove", { name });
    return NextResponse.json({ ok: true });
  }
  return err("action: generate | add | price | remove");
}
