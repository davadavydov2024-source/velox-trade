import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AdBanner } from "@/components/AdBanner";

export const metadata: Metadata = {
  title: "Velox Trade — Лучший магазин игровых предметов",
  description: "Маркетплейс игровых предметов для Roblox: Grow a Garden, Adopt Me, Blox Fruits, MM2, Blade Ball и другие.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-bg text-white min-h-screen flex flex-col">
        <Providers>
          <Header />
          <AdBanner />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
