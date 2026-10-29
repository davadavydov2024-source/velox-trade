import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";
import { isOwnMediaUrl } from "@/lib/messenger/server";
import { stickerKindOf } from "@/lib/messenger/stickers";
import type { MessengerSticker } from "@/lib/messenger/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const snap = await adminDb().collection("messengerStickerPacks").orderBy("updatedAt", "desc").limit(100).get();
  return NextResponse.json({ packs: snap.docs.map((d) => d.data()) });
}

/** POST { action:"save", slug, title, premium, published, stickers:[{url, emoji, preview?}] } | { action:"delete", slug } */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const b = await req.json().catch(() => ({}));
  if (typeof b.slug !== "string" || !/^[a-z0-9_]{3,32}$/.test(b.slug)) return NextResponse.json({ error: "slug: 3–32 символа, a-z, 0-9, _" }, { status: 400 });
  const ref = adminDb().collection("messengerStickerPacks").doc(b.slug);

  if (b.action === "delete") {
    await ref.delete();
    await logAdminAccess(admin.uid, "messenger_sticker_pack_delete", { slug: b.slug });
    return NextResponse.json({ ok: true });
  }
  if (b.action !== "save") return NextResponse.json({ error: "action: save или delete" }, { status: 400 });
  const title = String(b.title ?? "").trim();
  if (title.length < 2 || title.length > 40) return NextResponse.json({ error: "Название — от 2 до 40 символов" }, { status: 400 });
  const stickers = Array.isArray(b.stickers) ? b.stickers.slice(0, 120) : [];
  const clean: MessengerSticker[] = [];
  for (const s of stickers) {
    if (!isOwnMediaUrl(s?.url)) return NextResponse.json({ error: "Стикеры нужно загружать через админку" }, { status: 400 });
    clean.push({ url: s.url, emoji: String(s.emoji ?? "🙂").slice(0, 8), kind: stickerKindOf(s.url), ...(isOwnMediaUrl(s?.preview) ? { preview: s.preview } : {}) });
  }
  if (b.published === true && clean.length === 0) return NextResponse.json({ error: "Нельзя опубликовать пустой набор" }, { status: 400 });
  const now = Date.now();
  const prev = (await ref.get()).data();
  await ref.set({ ...(prev?.tgName ? { tgName: prev.tgName } : {}), ...(prev?.createdBy ? { createdBy: prev.createdBy } : {}), slug: b.slug, title, premium: b.premium === true, published: b.published === true, stickers: clean, createdAt: prev?.createdAt ?? now, updatedAt: now });
  await logAdminAccess(admin.uid, "messenger_sticker_pack_save", { slug: b.slug, count: clean.length });
  return NextResponse.json({ ok: true });
}
