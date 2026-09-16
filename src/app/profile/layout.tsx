"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Wallet, ShoppingBag, Heart, Settings, Shield, LogOut, LayoutDashboard, Palette, Tag, Gift, Rocket, Disc3, Trophy, ArrowLeftRight, Gamepad2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { isAdminUid } from "@/lib/users";
import { BADGE_COLOR, BADGE_LABEL } from "@/types";
import { useLanguage } from "@/lib/languageStore";
import { AccountSwitcher } from "@/components/AccountSwitcher";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, logout } = useAuth();
  const { t } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/auth/login");
  }, [loading, user, router]);

  if (loading || !user || !profile) {
    return <div className="max-w-5xl mx-auto px-4 py-20 text-center text-white/40">{t("common_loading")}</div>;
  }

  const linkGroups: { title: string | null; links: { href: string; label: string; icon: typeof Settings }[] }[] = [
    { title: null, links: [{ href: "/profile", label: t("profile_nav_overview"), icon: Settings }] },
    {
      title: "Магазин",
      links: [
        { href: "/profile/orders", label: t("profile_nav_orders"), icon: ShoppingBag },
        { href: "/profile/trades", label: "Обмены", icon: ArrowLeftRight },
        { href: "/profile/topup", label: t("profile_nav_topup"), icon: Wallet },
        { href: "/profile/sell", label: t("profile_nav_sell"), icon: Tag },
        { href: "/profile/my-products", label: t("my_products_title"), icon: Rocket },
        { href: "/profile/sales", label: "Мои продажи", icon: ShoppingBag },
      ],
    },
    {
      title: "Бонусы",
      links: [
        { href: "/profile/promos", label: t("profile_nav_promos"), icon: Gift },
        { href: "/profile/wheel", label: "Колесо Фортуны", icon: Disc3 },
        { href: "/profile/achievements", label: "Достижения", icon: Trophy },
      ],
    },
    {
      title: "Аккаунт",
      links: [
        { href: "/profile/favorites", label: t("profile_nav_favorites"), icon: Heart },
        { href: "/profile/appearance", label: t("profile_nav_appearance"), icon: Palette },
        { href: "/profile/roblox", label: "Roblox-аккаунт", icon: Gamepad2 },
        { href: "/profile/security", label: t("profile_nav_security"), icon: Shield },
      ],
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 grid md:grid-cols-[250px_1fr] gap-8">
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
        <AccountSwitcher />
        <div className="h-px bg-white/5 my-3" />
        {linkGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "pt-3" : ""}>
            {group.title && <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/25">{group.title}</p>}
            {group.links.map((l) => {
              const Icon = l.icon;
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm transition-all duration-150 ${
                    active ? "bg-accent/15 text-white font-medium" : "text-white/55 hover:bg-white/5 hover:text-white/80"
                  }`}
                >
                  {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-accent" />}
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      active ? "bg-accent text-black" : "bg-white/5 text-white/50"
                    }`}
                  >
                    <Icon size={14} />
                  </span>
                  {l.label}
                </Link>
              );
            })}
          </div>
        ))}
        {isAdminUid(user.uid) && (
          <Link
            href="/admin"
            className="flex items-center gap-3 px-3 py-2.5 mt-3 rounded-btn text-sm text-accent hover:bg-accent/10"
          >
            <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-accent/15">
              <LayoutDashboard size={14} />
            </span>
            {t("profile_nav_admin")}
          </Link>
        )}
        <button
          onClick={() => logout()}
          className="flex items-center gap-3 px-3 py-2.5 mt-1 rounded-btn text-sm text-red-400 hover:bg-red-400/10 w-full"
        >
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-red-400/10">
            <LogOut size={14} />
          </span>
          {t("profile_nav_logout")}
        </button>
      </aside>
      <div>{children}</div>
    </div>
  );
}
