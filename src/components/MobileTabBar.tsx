"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Plus, MessageSquare, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/authContext";

const TABS = [
  { href: "/catalog", label: "Каталог", icon: LayoutGrid },
  { href: "/profile/sell", label: "Продать", icon: Plus },
  { href: "/chats", label: "Чаты", icon: MessageSquare },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (pathname.startsWith("/admin")) return null;

  const profileTab = user
    ? { href: "/profile", label: "Профиль", icon: UserIcon }
    : { href: "/auth/login", label: "Войти", icon: UserIcon };

  const tabs = [...TABS, profileTab];
  const activeHref = tabs
    .map((t) => t.href)
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map((tab) => {
        const active = tab.href === activeHref;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] ${
              active ? "text-accent" : "text-white/50"
            }`}
          >
            <Icon size={20} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
