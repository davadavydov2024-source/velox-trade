import { NextRequest, NextResponse } from "next/server";
import { getAppIconStyle, iconPaths, isAppIcon } from "@/lib/messenger/appIcon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Манифест MiliGram с иконкой, которую выбрал админ. Берёт обычный public/miligram/manifest.webmanifest
 * и подменяет только icons — всё остальное (id, start_url, scope, цвета) остаётся как было.
 */
export async function GET(req: NextRequest) {
  // ?icon=<id> — иконка, выбранная самим пользователем; иначе — выбор админа
  const asked = req.nextUrl.searchParams.get("icon");
  const style = isAppIcon(asked) ? asked : await getAppIconStyle();
  const p = iconPaths(style);
  let base: Record<string, unknown> = {};
  try {
    const r = await fetch(new URL("/miligram/manifest.webmanifest", req.url), { cache: "no-store" });
    if (r.ok) base = await r.json();
  } catch {}
  if (!base.name) base = { name: "MiliGram", short_name: "MiliGram", id: "/m", start_url: "/m", scope: "/m/", display: "standalone", background_color: "#0b0b0d", theme_color: "#0b0b0d", lang: "ru" };
  const manifest = {
    ...base,
    // Всегда /m — чтобы APK (PWABuilder/Bubblewrap) и установка открывали мессенджер, а не главную сайта
    id: "/m",
    start_url: "/m",
    scope: "/m/",
    display: "standalone",
    icons: [
      { src: p.i192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: p.i512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: p.maskable, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new NextResponse(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": asked ? "public, max-age=3600" : "public, max-age=300" } });
}
