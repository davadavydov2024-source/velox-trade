import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { isPremium } from "@/lib/messenger/premium";
import type { MessengerStickerPack } from "@/lib/messenger/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_PACKS = 50;
const slugOk = (s: unknown): s is string => typeof s === "string" && /^[a-z0-9_]{3,32}$/.test(s);

/**
 * GET ?slug= — набор по ссылке /m?stickers=<slug> (карточка с кнопкой «Добавить»): { pack, added, locked }.
 * GET без slug — мои добавленные наборы (locked = премиум-набор, а Mili Premium закончился).
 */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const db = adminDb();
  const premium = isPremium(me.account);
  const slug = req.nextUrl.searchParams.get("slug");

  const mine: string[] = ((await db.collection("messengerUserStickers").doc(me.uid).get()).data()?.slugs as string[] | undefined) ?? [];
  if (slug) {
    if (!slugOk(slug)) return fail("Набор не найден", 404);
    const pack = (await db.collection("messengerStickerPacks").doc(slug).get()).data() as MessengerStickerPack | undefined;
    if (!pack || !pack.published) return fail("Набор не найден", 404);
    return NextResponse.json({ pack, added: mine.includes(slug), locked: pack.premium && !premium });
  }
  if (mine.length === 0) return NextResponse.json({ packs: [] });
  const docs = await db.getAll(...mine.map((s) => db.collection("messengerStickerPacks").doc(s)));
  const packs = docs.map((d) => d.data() as MessengerStickerPack | undefined).filter((p): p is MessengerStickerPack => !!p && p.published).map((p) => ({ ...p, locked: p.premium && !premium }));
  return NextResponse.json({ packs });
}

/** POST { slug, action: "add"|"remove" } — добавить набор по ссылке (премиум-наборы — только с Mili Premium). */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  const b = await req.json().catch(() => ({}));
  if (!slugOk(b.slug)) return fail("Набор не найден", 404);
  const db = adminDb();
  const ref = db.collection("messengerUserStickers").doc(me.uid);

  if (b.action === "remove") {
    await ref.set({ slugs: FieldValue.arrayRemove(b.slug) }, { merge: true });
    return NextResponse.json({ ok: true });
  }
  if (b.action !== "add") return fail("action: add или remove");
  const pack = (await db.collection("messengerStickerPacks").doc(b.slug).get()).data() as MessengerStickerPack | undefined;
  if (!pack || !pack.published) return fail("Набор не найден", 404);
  if (pack.premium && !isPremium(me.account)) return NextResponse.json({ error: "Этот набор доступен только с Mili Premium", needPremium: true }, { status: 403 });
  const cur: string[] = ((await ref.get()).data()?.slugs as string[] | undefined) ?? [];
  if (!cur.includes(b.slug) && cur.length >= MAX_PACKS) return fail(`Не больше ${MAX_PACKS} наборов`);
  await ref.set({ slugs: FieldValue.arrayUnion(b.slug) }, { merge: true });
  return NextResponse.json({ ok: true });
}
