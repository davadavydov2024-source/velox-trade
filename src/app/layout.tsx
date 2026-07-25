import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AdBanner } from "@/components/AdBanner";

// Весь сайт по сути персонализированный (баланс, заказы, чаты, роль админа зависят от того, кто
// вошёл) — статическая генерация страниц на этапе сборки тут не нужна и, более того, вредна:
// Next.js пытается заранее отрисовать "use client" страницы прямо во время `next build`, а это
// исполняет код Firebase в Node.js-окружении без браузера. Если на этом этапе (например, в Docker-сборке
// на хостинге без переменных окружения) не заданы NEXT_PUBLIC_FIREBASE_*, Firebase бросает
// "auth/invalid-api-key" и ломает всю сборку. force-dynamic отключает эту прероговорную отрисовку —
// каждая страница рендерится по запросу на уже запущенном сервере, где переменные окружения точно есть.
export const dynamic = "force-dynamic";

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
          <AdBanner />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
