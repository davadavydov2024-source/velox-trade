import type { Metadata, Viewport } from "next";
import { MxRoot } from "@/components/messenger/MxRoot";

export const metadata: Metadata = {
  title: "MiliGram",
  description: "MiliGram — мессенджер Velox Trade",
  manifest: "/miligram/manifest.webmanifest",
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/miligram/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/miligram/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "MiliGram", statusBarStyle: "black-translucent" },
  other: { "mobile-web-app-capable": "yes" },
};

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
