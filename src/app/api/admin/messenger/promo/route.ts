import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { adminDb } from "@/lib/firebaseAdmin";
import { logAdminAccess, requireAdmin } from "@/lib/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const err = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const gen = () => Array.from({ length: 8 }, () => ALPHA[randomInt(ALPHA.length)]).join("");

export async function GET(req: NextRequest) {
  const a = await requireAdmin(req);
  if ("error" in a) return a.error;
  const snap = await adminDb().collection("messengerPromoCodes").orderBy("createdAt", "desc").limit(200).get();
  return NextResponse.json({ codes: snap.docs.map((d) => ({ code: d.id, ...d.data() })) });
}

/** POST { action: "create", code?, days, maxUses, expiresDays } | { action: "delete", code } | { action: "disable", code, disabled } */
export async function POST(req: NextRequest) {
  const a = await requireAdmin(req);
  if ("error" in a) return a.error;
  const b = await req.json().catch(() => ({}));
  const col = adminDb().collection("messengerPromoCodes");
  if (b.action === "create") {
    const days = Math.round(Number(b.days));
    if (!Number.isFinite(days) || days < 1 || days > 3650) return err("Дней Premium: от 1 до 3650");
    const maxUses = Math.max(0, Math.min(1_000_000, Math.round(Number(b.maxUses) || 0)));
    const expDays = Math.max(0, Math.min(3650, Math.round(Number(b.expiresDays) || 0)));
    let code = typeof b.code === "string" ? b.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32) : "";
    if (code && code.length < 4) return err("Код — от 4 символов (A–Z, 0–9)");
    if (!code) code = gen();
    const ref = col.doc(code);
    if ((await ref.get()).exists) return err("Такой код уже есть");
    await ref.set({ days, maxUses, used: 0, expiresAt: expDays ? Date.now() + expDays * 86400_000 : 0, disabled: false, createdAt: Date.now(), createdBy: a.uid });
    await logAdminAccess(a.uid, "messenger_promo_create", { code, days, maxUses });
    return NextResponse.json({ ok: true, code });
  }
  const code = typeof b.code === "string" ? b.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9_-]{4,32}$/.test(code)) return err("Некорректный код");
  if (b.action === "disable") { await col.doc(code).update({ disabled: b.disabled !== false }); return NextResponse.json({ ok: true }); }
  if (b.action === "delete") { await col.doc(code).delete(); await logAdminAccess(a.uid, "messenger_promo_delete", { code }); return NextResponse.json({ ok: true }); }
  return err("action: create | disable | delete");
}
