import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";
import { DEFAULT_MILIGRAM_CONFIG, MILIGRAM_FLAG_ROWS, MiliGramConfig } from "@/lib/miligram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ref = () => adminDb().collection("settings").doc("miligram");

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const snap = await ref().get();
  const data = (snap.data() ?? {}) as Partial<MiliGramConfig>;
  const config: MiliGramConfig = {
    ...DEFAULT_MILIGRAM_CONFIG,
    ...data,
    flags: { ...DEFAULT_MILIGRAM_CONFIG.flags, ...(data.flags ?? {}) },
    announcement: { ...DEFAULT_MILIGRAM_CONFIG.announcement, ...(data.announcement ?? {}) },
  };
  return NextResponse.json({ config });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  try {
    const body = (await req.json()) as Partial<MiliGramConfig>;
    const flags: Record<string, boolean> = {};
    for (const row of MILIGRAM_FLAG_ROWS) flags[row.key] = body.flags?.[row.key] !== false;

    const minVersion = String(body.minVersion ?? "").trim();
    if (minVersion && !/^[0-9]+(\.[0-9]+){0,3}$/.test(minVersion)) {
      return NextResponse.json({ error: "Версия вида 1.2.3" }, { status: 400 });
    }
    const text = String(body.announcement?.text ?? "").slice(0, 500);
    const prev = ((await ref().get()).data() ?? {}) as Partial<MiliGramConfig>;
    // Новый id объявления — чтобы приложение показало его ещё раз, даже если пользователь закрывал старое.
    const id = text && text !== prev.announcement?.text ? String(Date.now()) : prev.announcement?.id ?? "";
    const config: MiliGramConfig = { flags, minVersion, announcement: { id, text, active: body.announcement?.active === true && !!text }, updatedAt: Date.now() };
    await ref().set(config);
    await logAdminAccess(admin.uid, "miligram_config_update");
    return NextResponse.json({ ok: true, config });
  } catch {
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 400 });
  }
}
