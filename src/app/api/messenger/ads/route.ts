import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";
import { fail, requireMessenger } from "@/lib/messenger/server";
import { isPremium } from "@/lib/messenger/premium";
import type { PublicAd } from "@/lib/messenger/ads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?placement=channel|viewer -> { ad: PublicAd | null }. Подписчикам Mili Premium реклама не показывается. */
export async function GET(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (isPremium(me.account)) return NextResponse.json({ ad: null });
  const placement = req.nextUrl.searchParams.get("placement") === "viewer" ? "viewer" : "channel";
  const snap = await adminDb().collection("messengerAds").where("active", "==", true).limit(60).get();
  const now = Date.now();
  const list = snap.docs.filter((d) => { const x = d.data(); return x[placement] === true && !(x.endsAt && x.endsAt < now); });
  if (!list.length) return NextResponse.json({ ad: null });
  const d = list[Math.floor(Math.random() * list.length)];
  const x = d.data();
  const ad: PublicAd = { id: d.id, title: x.title, text: x.text ?? "", mediaUrl: x.mediaUrl, mediaKind: x.mediaKind === "video" ? "video" : "image", buttonText: x.buttonText, buttonUrl: x.buttonUrl };
  return NextResponse.json({ ad });
}

/** POST { id, event: "view" | "click" } — счётчики показов и переходов. */
export async function POST(req: NextRequest) {
  const me = await requireMessenger(req);
  if ("error" in me) return me.error;
  if (!(await rateLimit(`msgr_ad_${me.uid}`, 120, 60_000))) return fail("Слишком часто", 429);
  const b = await req.json().catch(() => ({}));
  if (typeof b.id !== "string" || !b.id || b.id.length > 80 || b.id.includes("/")) return fail("Некорректное объявление");
  if (b.event !== "view" && b.event !== "click") return fail("event: view | click");
  const ref = adminDb().collection("messengerAds").doc(b.id);
  if (!(await ref.get()).exists) return fail("Не найдено", 404);
  await ref.update({ [b.event === "view" ? "views" : "clicks"]: FieldValue.increment(1) });
  return NextResponse.json({ ok: true });
}
