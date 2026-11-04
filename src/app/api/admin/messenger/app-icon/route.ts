import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAdmin, logAdminAccess } from "@/lib/adminGuard";
import { APP_ICON_STYLES, getAppIconStyle, isAppIcon } from "@/lib/messenger/appIcon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — { current, styles }. POST { style } — выбрать иконку MiliGram (одна для всех). */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  return NextResponse.json({ current: await getAppIconStyle(), styles: APP_ICON_STYLES });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if ("error" in admin) return admin.error;
  const b = await req.json().catch(() => ({}));
  if (!isAppIcon(b.style)) return NextResponse.json({ error: "Такого стиля нет" }, { status: 400 });
  await adminDb().collection("messengerConfig").doc("appIcon").set({ style: b.style, at: Date.now(), by: admin.uid });
  await logAdminAccess(admin.uid, "messenger_app_icon", { style: b.style });
  return NextResponse.json({ ok: true, current: b.style });
}
