import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MobileTabBar } from "@/components/MobileTabBar";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Не запрещаем зум полностью (userScalable: false вредит доступности — люди со слабым
  // зрением не смогут увеличить текст) — просто не даём растянуть страницу больше чем в 2 раза,
  // чтобы при случайном пинче интерфейс не разъезжался.
  maximumScale: 2,
};

export const metadata: Metadata = {
  title: "Velox Trade — Лучший магазин игровых предметов",
  description: "Маркетплейс игровых предметов для Roblox: Grow a Garden, Adopt Me, Blox Fruits, MM2, Blade Ball и другие.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Velox Trade",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-bg text-white min-h-screen flex flex-col">
        <Providers>
          <Header />
          <main className="flex-1 pb-16 lg:pb-0">{children}</main>
          <Footer />
          <MobileTabBar />
        </Providers>
      </body>
    </html>
  );
}
