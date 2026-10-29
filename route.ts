import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — последние 60 действий администраторов (выдачи, стикеры, чтение переписок) с именами, для вкладки «Журнал». */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const db = adminDb();
  const snap = await db.collection("adminAuditLog").orderBy("at", "desc").limit(60).get();
  const rows: Record<string, any>[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) }));

  const uids: string[] = Array.from(new Set<string>(rows.flatMap((r) => [r.adminUid, r.targetUid]).filter((u: unknown): u is string => typeof u === "string" && !!u && !u.includes("/"))));
  const names = new Map<string, string>();
  if (uids.length) {
    const docs = await db.getAll(...uids.map((u) => db.collection("messengerAccounts").doc(u)));
    docs.forEach((d, i) => { const a = d.data(); if (a) names.set(uids[i], `${a.displayName ?? "?"} (@${a.handle ?? "?"})`); });
  }

  const items = rows.map((r) => {
    const { id, at, action, adminUid, targetUid, ...info } = r;
    return { id, at, action, adminName: names.get(adminUid) ?? (adminUid ? String(adminUid).slice(0, 8) + "…" : ""), targetName: targetUid ? names.get(targetUid) ?? String(targetUid).slice(0, 8) + "…" : "", info };
  });
  return NextResponse.json({ items });
}
