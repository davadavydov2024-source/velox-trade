import { NextResponse } from "next/server";

export const dynamic = "force-static";

/** Манифест отдельного PWA «Velox Chat»: на iOS/Android ставится как самостоятельное приложение, открывается на /m. */
export function GET() {
  const manifest = {
    name: "Velox Chat",
    short_name: "Velox Chat",
    description: "Мессенджер Velox",
    id: "/vc",
    start_url: "/vc",
    scope: "/vc/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0b0d",
    theme_color: "#0b0b0d",
    lang: "ru",
    icons: [
      { src: "/vc/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/vc/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/vc/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new NextResponse(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
