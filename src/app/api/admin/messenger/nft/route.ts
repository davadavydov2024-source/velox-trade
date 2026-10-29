import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminGuard";
import { nftComboChance, nftTier } from "@/lib/messenger/nft";
import type { MessengerGift } from "@/lib/messenger/gifts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — обзор NFT-подарков (по последним 500 подаркам): сколько каких NFT выдано, раскладка по редкости
 * и самые редкие экземпляры с владельцами. Только для админов.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const db = adminDb();

  const snap = await db.collection("messengerGifts").orderBy("at", "desc").limit(500).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessengerGift);
  const nfts = rows.filter((g) => g.nft);

  const byGift: Record<string, number> = {};
  const tiers: Record<string, number> = {};
  for (const g of nfts) {
    byGift[g.giftId] = (byGift[g.giftId] ?? 0) + 1;
    const t = nftTier(g.nft!);
    tiers[t] = (tiers[t] ?? 0) + 1;
  }

  const rare = [...nfts].sort((a, b) => nftComboChance(a.nft!) - nftComboChance(b.nft!)).slice(0, 15);
  const owners = Array.from(new Set(rare.map((g) => g.to)));
  const accs = owners.length ? await db.getAll(...owners.map((u) => db.collection("messengerAccounts").doc(u))) : [];
  const byUid: Record<string, { displayName?: string; handle?: string } | undefined> = {};
  accs.forEach((a, i) => { byUid[owners[i]] = a.data() as { displayName?: string; handle?: string } | undefined; });

  return NextResponse.json({
    scanned: rows.length,
    total: nfts.length,
    byGift: Object.entries(byGift).map(([giftId, count]) => ({ giftId, count })).sort((a, b) => b.count - a.count),
    tiers,
    rare: rare.map((g) => ({
      id: g.id,
      giftId: g.giftId,
      number: g.nft!.number,
      supply: g.nft!.supply,
      tier: nftTier(g.nft!),
      chance: nftComboChance(g.nft!),
      owner: byUid[g.to] ? { uid: g.to, displayName: byUid[g.to]?.displayName ?? "", handle: byUid[g.to]?.handle ?? "" } : { uid: g.to, displayName: "", handle: "" },
    })),
  });
}
