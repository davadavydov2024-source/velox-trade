import type { Metadata, Viewport } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "MiliGram",
  description: "MiliGram — мессенджер Velox Trade",
  manifest: "/miligram/manifest.webmanifest",
  icons: { icon: "/miligram/favicon-48.png", apple: "/miligram/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "MiliGram", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0d1017",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

/** Мессенджер занимает весь экран поверх шапки и нижней навигации сайта (их не нужно править). */
export default function MessengerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[200] bg-bg text-white overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {children}
    </div>
  );
}
