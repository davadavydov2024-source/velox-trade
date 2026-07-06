"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Wallet, ShoppingBag, Heart, Settings, Shield, LogOut, LayoutDashboard, Palette, Tag } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { isAdminUid } from "@/lib/users";
import { BADGE_COLOR, BADGE_LABEL } from "@/types";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/auth/login");
  }, [loading, user, router]);

  if (loading || !user || !profile) {
    return <div className="max-w-5xl mx-auto px-4 py-20 text-center text-white/40">Загрузка...</div>;
  }

  const links = [
    { href: "/profile", label: "Профиль", icon: Settings },
    { href: "/profile/orders", label: "История покупок", icon: ShoppingBag },
    { href: "/profile/topup", label: "Пополнение баланса", icon: Wallet },
    { href: "/profile/sell", label: "Продать предметы", icon: Tag },
    { href: "/profile/favorites", label: "Любимые товары", icon: Heart },
    { href: "/profile/appearance", label: "Оформление", icon: Palette },
    { href: "/profile/security", label: "Безопасность", icon: Shield },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 grid md:grid-cols-[240px_1fr] gap-8">
      <aside className="space-y-1">
        <div className="card p-4 mb-4">
          <p className="font-medium truncate">{profile.displayName}</p>
          <p className="text-xs text-white/40 truncate mb-2">{profile.email}</p>
          <div className="flex flex-wrap gap-1">
            {profile.badges.map((b) => (
              <span
                key={b}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: `${BADGE_COLOR[b]}22`, color: BADGE_COLOR[b] }}
              >
                {BADGE_LABEL[b]}
              </span>
            ))}
          </div>
        </div>
        {links.map((l) => {
          const Icon = l.icon;
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm transition-colors ${
                active ? "bg-accent/15 text-accent" : "text-white/60 hover:bg-white/5"
              }`}
            >
              <Icon size={16} /> {l.label}
            </Link>
          );
        })}
        {isAdminUid(user.uid) && (
          <Link
            href="/admin"
            className="flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm text-accent hover:bg-accent/10"
          >
            <LayoutDashboard size={16} /> Админ-панель
          </Link>
        )}
        <button
          onClick={() => logout()}
          className="flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm text-red-400 hover:bg-red-400/10 w-full"
        >
          <LogOut size={16} /> Выйти
        </button>
      </aside>
      <div>{children}</div>
    </div>
  );
}
