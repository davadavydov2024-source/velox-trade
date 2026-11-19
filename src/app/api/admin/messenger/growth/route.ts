import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DAY = 86400_000, TZ = 3 * 3600_000; // сутки по Москве

/** GET — новые аккаунты по дням за 14 суток + итоги. */
export async function GET(req: NextRequest) {
  const a = await requireAdmin(req);
  if ("error" in a) return a.error;
  const db = adminDb();
  const acc = db.collection("messengerAccounts");
  const today = Math.floor((Date.now() + TZ) / DAY);
  const days = await Promise.all(Array.from({ length: 14 }, (_, i) => today - 13 + i).map(async (d) => {
    const from = d * DAY - TZ;
    const count = (await acc.where("createdAt", ">=", from).where("createdAt", "<", from + DAY).count().get()).data().count;
    return { date: new Date(d * DAY).toISOString().slice(5, 10), count };
  }));
  const [total, premium, tracks, ads] = await Promise.all([
    acc.count().get(),
    acc.where("premiumUntil", ">", Date.now()).count().get(),
    db.collection("messengerMusicTracks").count().get(),
    db.collection("messengerAds").where("active", "==", true).count().get(),
  ]);
  return NextResponse.json({ days, total: total.data().count, premium: premium.data().count, tracks: tracks.data().count, ads: ads.data().count });
}
