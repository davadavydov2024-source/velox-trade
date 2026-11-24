import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Манифест основного сайта: на экране «Домой» (iOS/Android) приложение называется «Mili Gram» и использует его иконку. */
export function GET() {
  const manifest = {
    id: "/",
    name: "Mili Gram",
    short_name: "Mili Gram",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0b0d",
    theme_color: "#0b0b0d",
    lang: "ru",
    icons: [
      { src: "/miligram/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/miligram/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/m/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new NextResponse(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
