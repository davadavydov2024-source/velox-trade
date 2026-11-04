import type { Metadata, Viewport } from "next";
import { MxRoot } from "@/components/messenger/MxRoot";
import { getAppIconStyle, iconPaths } from "@/lib/messenger/appIcon";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const p = iconPaths(await getAppIconStyle());
  return {
    title: "MiliGram",
    description: "MiliGram — мессенджер Velox Trade",
    manifest: "/api/miligram/manifest",
    robots: { index: false, follow: false },
    icons: {
      icon: [{ url: p.i192, sizes: "192x192", type: "image/png" }],
      apple: [{ url: p.i180, sizes: "180x180" }],
    },
    appleWebApp: { capable: true, title: "MiliGram", statusBarStyle: "black-translucent" },
    other: { "mobile-web-app-capable": "yes" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0b0d",
};

export default function MessengerLayout({ children }: { children: React.ReactNode }) {
  return <MxRoot>{children}</MxRoot>;
}
