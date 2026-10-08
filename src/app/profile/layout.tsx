"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Wallet, ShoppingBag, Heart, Settings, Shield, LogOut, LayoutDashboard, Palette, Tag, Gift, Rocket, Disc3, Trophy, ArrowLeftRight, Plus } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { isAdminUid } from "@/lib/users";
import { BADGE_COLOR, BADGE_LABEL } from "@/types";
import { useLanguage } from "@/lib/languageStore";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { ProfileBanner } from "@/components/ProfileBanner";
import { safeImageSrc } from "@/lib/safeImage";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, logout } = useAuth();
  const { t } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();

  const chipsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/auth/login");
  }, [loading, user, router]);

  // На телефоне пункты меню — горизонтальная лента: при смене раздела подводим активный чип в центр,
  // чтобы человек всегда видел, где он находится, а не искал его в обрезанной ленте.
  useEffect(() => {
    const el = chipsRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [pathname]);

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
        { href: "/profile/security", label: t("profile_nav_security"), icon: Shield },
      ],
    },
  ];

  const allLinks = linkGroups.flatMap((g) => g.links);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 md:py-10 grid md:grid-cols-[250px_1fr] gap-5 md:gap-8">
      {/* Мобильная навигация: компактная шапка + горизонтальная лента разделов вместо длинного списка */}
      <div className="md:hidden space-y-3 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-10 h-10 rounded-full overflow-hidden bg-surface shrink-0 ring-2 ring-accent/60">
              <Image src={safeImageSrc(profile.photoURL, "/placeholder.svg")} alt="" fill className="object-cover" sizes="40px" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate leading-tight">{profile.displayName}</p>
              <p className="text-[11px] text-white/35 truncate">{profile.email}</p>
            </div>
          </div>
          <Link href="/profile/topup" className="shrink-0 flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-accent/10 border border-accent/25 text-sm">
            <span className="font-bold text-accent">{profile.balance.toFixed(0)} ₽</span>
            <span className="w-5 h-5 rounded-full bg-accent text-black flex items-center justify-center">
              <Plus size={13} strokeWidth={3} />
            </span>
          </Link>
        </div>
        <AccountSwitcher />
        <div ref={chipsRef} className="-mx-4 px-4 flex gap-2 overflow-x-auto scrollbar-none pb-1">
          {allLinks.map((l) => {
            const Icon = l.icon;
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                data-active={active}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${
                  active ? "bg-accent text-black" : "bg-white/5 text-white/60 active:bg-white/10"
                }`}
              >
                <Icon size={14} /> {l.label}
              </Link>
            );
          })}
          {isAdminUid(user.uid) && (
            <Link href="/admin" className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium whitespace-nowrap bg-accent/10 text-accent">
              <LayoutDashboard size={14} /> {t("profile_nav_admin")}
            </Link>
          )}
          <button
            onClick={() => logout()}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-medium whitespace-nowrap bg-red-400/10 text-red-400"
          >
            <LogOut size={14} /> {t("profile_nav_logout")}
          </button>
        </div>
      </div>

      <aside className="hidden md:block space-y-1">
        <div className="card overflow-hidden mb-4">
          <ProfileBanner url={profile.bannerURL} className="h-16" />
          <div className="p-4 pt-0">
          <div className="relative w-14 h-14 -mt-7 mb-2 rounded-full overflow-hidden bg-surface ring-4 ring-surface shadow-[0_0_0_2px_var(--color-accent)]">
            <Image src={safeImageSrc(profile.photoURL, "/placeholder.svg")} alt="" fill className="object-cover" sizes="56px" />
          </div>
          <p className="font-semibold truncate">{profile.displayName}</p>
          <p className="text-xs text-white/40 truncate mb-3">{profile.email}</p>
          <Link
            href="/profile/topup"
            className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-btn bg-accent/10 border border-accent/20 hover:bg-accent/15 transition-colors mb-3"
          >
            <span>
              <span className="block text-[10px] text-white/40 leading-none mb-1">Баланс</span>
              <span className="block text-lg font-bold text-accent leading-none">{profile.balance.toFixed(0)} ₽</span>
            </span>
            <span className="w-7 h-7 rounded-full bg-accent text-black flex items-center justify-center shrink-0">
              <Plus size={15} strokeWidth={3} />
            </span>
          </Link>
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
