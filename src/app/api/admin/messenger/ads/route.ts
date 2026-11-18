import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { logAdminAccess, requireAdmin } from "@/lib/adminGuard";
import { isOwnMediaUrl } from "@/lib/messenger/server";
import { AD_LIMITS, isSafeAdUrl, type MessengerAd } from "@/lib/messenger/ads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const err = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const okId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 80 && !v.includes("/");

/** GET — все объявления со статистикой. */
export async function GET(req: NextRequest) {
  const a = await requireAdmin(req);
  if ("error" in a) return a.error;
  const snap = await adminDb().collection("messengerAds").orderBy("createdAt", "desc").limit(200).get();
  return NextResponse.json({ ads: snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MessengerAd[] });
}

function fields(b: any, partial: boolean): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};
  if (!partial || b.title !== undefined) { const t = clean(b.title, AD_LIMITS.title); if (!t) return "Укажи заголовок"; out.title = t; }
  if (!partial || b.text !== undefined) { out.text = clean(b.text, AD_LIMITS.text); }
  if (!partial || b.buttonText !== undefined) { const t = clean(b.buttonText, AD_LIMITS.button); if (!t) return "Укажи текст кнопки"; out.buttonText = t; }
  if (!partial || b.buttonUrl !== undefined) { if (!isSafeAdUrl(b.buttonUrl)) return "Ссылка кнопки должна начинаться с https://"; out.buttonUrl = b.buttonUrl; }
  if (!partial || b.mediaUrl !== undefined) {
    if (!isOwnMediaUrl(b.mediaUrl)) return "Загрузи фото или видео";
    out.mediaUrl = b.mediaUrl; out.mediaKind = b.mediaKind === "video" ? "video" : "image";
  }
  if (!partial || b.channel !== undefined) out.channel = b.channel !== false;
  if (!partial || b.viewer !== undefined) out.viewer = b.viewer !== false;
  if (b.endsAt !== undefined) out.endsAt = typeof b.endsAt === "number" && b.endsAt > Date.now() ? Math.round(b.endsAt) : 0;
  return out;
}

/** POST { action: "add" | "edit" | "toggle" | "delete", ... } */
export async function POST(req: NextRequest) {
  const a = await requireAdmin(req);
  if ("error" in a) return a.error;
  const b = await req.json().catch(() => ({}));
  const db = adminDb();

  if (b.action === "add") {
    const f = fields(b, false);
    if (typeof f === "string") return err(f);
    if (!f.channel && !f.viewer) return err("Выбери, где показывать: в каналах и/или при просмотре фото");
    const ref = db.collection("messengerAds").doc();
    await ref.set({ ...f, active: true, views: 0, clicks: 0, createdAt: Date.now(), createdBy: a.uid });
    await logAdminAccess(a.uid, "messenger_ad_add", { adId: ref.id, title: f.title });
    return NextResponse.json({ ok: true, id: ref.id });
  }
  if (!okId(b.id)) return err("Некорректное объявление");
  const ref = db.collection("messengerAds").doc(b.id);
  const cur = (await ref.get()).data();
  if (!cur) return err("Объявление не найдено", 404);

  if (b.action === "edit") {
    const f = fields(b, true);
    if (typeof f === "string") return err(f);
    await ref.update(f);
    await logAdminAccess(a.uid, "messenger_ad_edit", { adId: b.id });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "toggle") {
    await ref.update({ active: !!b.active });
    await logAdminAccess(a.uid, "messenger_ad_toggle", { adId: b.id, active: !!b.active });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "delete") {
    await ref.delete();
    try { const { del } = await import("@vercel/blob"); if (isOwnMediaUrl(cur.mediaUrl)) await del(cur.mediaUrl); } catch {}
    await logAdminAccess(a.uid, "messenger_ad_delete", { adId: b.id, title: cur.title });
    return NextResponse.json({ ok: true });
  }
  return err("action: add | edit | toggle | delete");
}
