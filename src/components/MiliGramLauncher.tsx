"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Кнопка входа в мессенджер MiliGram — видна всем, БЕЗ пароля и кода: нажал и попал на /m
 * (там вход или регистрация по почте). Плавающая круглая иконка; на телефоне поднята над нижней навигацией.
 * Скрыта в самом мессенджере, админке и на страницах входа.
 */
export function MiliGramLauncher() {
  const pathname = usePathname();
  if (pathname === "/m" || pathname.startsWith("/m/") || pathname.startsWith("/m?") || pathname.startsWith("/admin") || pathname.startsWith("/auth")) return null;
  return (
    <Link
      href="/m"
      aria-label="Открыть MiliGram"
      title="MiliGram — мессенджер"
      className="fixed right-4 z-40 bottom-[calc(76px+env(safe-area-inset-bottom))] lg:bottom-6 group flex items-center gap-2"
    >
      <span className="hidden lg:block opacity-0 group-hover:opacity-100 transition-opacity bg-surface border border-border text-xs text-white/80 rounded-full px-3 py-1.5 shadow-card">MiliGram</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/miligram/icon-192.png" alt="MiliGram" width={56} height={56} className="w-14 h-14 rounded-2xl shadow-glow transition-transform duration-200 group-hover:scale-105 group-active:scale-95" />
    </Link>
  );
}
