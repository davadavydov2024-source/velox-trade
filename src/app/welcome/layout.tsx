import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "MiliGram — чаты, каналы и подарки",
  description: "MiliGram — мессенджер: переписки, группы и каналы, голосовые и видеокружки, стикеры и подарки. Работает в браузере, есть приложения для Windows и Android.",
  openGraph: { title: "MiliGram — чаты, каналы и подарки", description: "Переписки, группы, каналы и подарки в одном приложении.", type: "website", images: ["/miligram/icon-512.png"] },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#000000" };

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
