"use client";

import { useUnread } from "@/lib/unreadContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, ShoppingCart, Wallet, User as UserIcon, Menu, X, LayoutGrid, Gamepad2, MessageSquare, CirclePlus } from "lucide-react";
import { useCart } from "@/lib/cartStore";
import { useAuth } from "@/lib/authContext";
import { useLanguage } from "@/lib/languageStore";
import { NotificationBell } from "@/components/NotificationBell";

export function Header() {
  const cartCount = useCart((s) => s.count());
  const { user, profile } = useAuth();
  const { t } = useLanguage();
  const { total: unreadTotal } = useUnread();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  // Корзина читается из localStorage, которого нет на сервере — поэтому первая отрисовка
  // на сервере и в браузере отличается. Показываем бейдж только после монтирования на клиенте,
  // чтобы избежать ошибки гидратации Next.js.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (mobileSearchOpen) mobileSearchRef.current?.focus();
  }, [mobileSearchOpen]);
  // Шапка не перемонтируется при переходах между страницами (живёт в корневом layout),
  // поэтому без этого открытый поиск/мобильное меню "прилипали" на следующей странице.
  useEffect(() => {
    setMobileSearchOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const navItem = (href: string, label: string, Icon: typeof LayoutGrid, badge?: number) => {
    const active = pathname === href.split("?")[0] && !href.includes("?");
    return (
      <Link
        key={href}
        href={href}
        className={`relative flex flex-col items-center gap-1 px-3 py-1.5 rounded-[10px] text-[11px] font-medium transition-colors ${
          active ? "text-white" : "text-white/50 hover:text-white"
        }`}
      >
        <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
        {label}
        {!!badge && badge > 0 && (
          <span className="absolute top-0 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-black text-[10px] font-bold leading-4 text-center">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-50 bg-bg/95 border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[68px] flex items-center gap-4 lg:gap-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/velox-mark.svg" alt="Velox Trade" width={36} height={36} className="w-9 h-9 rounded-[10px]" />
          <span className="font-display text-[16px] font-semibold hidden sm:block">
            Velox<span className="text-white/40">Trade</span>
          </span>
        </Link>

        <form
          action="/catalog"
          className="hidden md:flex flex-1 relative"
          onSubmit={(e) => {
            e.preventDefault();
            window.location.href = `/catalog?q=${encodeURIComponent(search)}`;
          }}
        >
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/35" size={18} />
          <input
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Найти предмет, игру или продавца"
            className="input-field pl-11 py-2.5 text-sm rounded-[14px]"
          />
        </form>

        <div className="flex items-center gap-1 ml-auto shrink-0">
          <nav className="hidden lg:flex items-center gap-0.5 mr-2">
            {navItem("/catalog", t("nav_catalog"), LayoutGrid)}
            {navItem("/games", t("nav_games"), Gamepad2)}
            {navItem("/profile/sell", "Продать", CirclePlus)}
            {navItem("/chats", t("nav_chats"), MessageSquare, unreadTotal)}
          </nav>

          {mounted && profile && (
            <Link href="/profile/topup" className="hidden sm:flex items-center gap-1.5 btn-secondary py-2 px-3 text-sm">
              <Wallet size={16} className="text-accent" />
              {profile.balance.toLocaleString("ru-RU")} ₽
            </Link>
          )}
          <button
            className="md:hidden btn-secondary py-2 px-3"
            onClick={() => setMobileSearchOpen((v) => !v)}
            aria-label="Поиск"
          >
            {mobileSearchOpen ? <X size={18} /> : <Search size={18} />}
          </button>
          <Link href="/cart" className="relative btn-secondary py-2 px-3" aria-label="Корзина">
            <ShoppingCart size={18} />
            {mounted && cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-accent text-black text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>
          <NotificationBell />
          {user ? (
            <Link href="/profile" className="hidden lg:flex btn-secondary py-2 px-3" aria-label="Профиль">
              <UserIcon size={18} />
            </Link>
          ) : (
            <Link href="/auth/login" className="hidden lg:flex btn-primary py-2 px-4 text-sm">
              {t("nav_login")}
            </Link>
          )}
          <button className="lg:hidden btn-secondary py-2 px-3" onClick={() => setMenuOpen((v) => !v)} aria-label="Меню">
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {mobileSearchOpen && (
        <form
          action="/catalog"
          className="md:hidden px-4 pb-3 relative"
          onSubmit={(e) => {
            e.preventDefault();
            window.location.href = `/catalog?q=${encodeURIComponent(search)}`;
          }}
        >
          <Search className="absolute left-7 top-1/2 -translate-y-1/2 text-white/30" size={18} />
          <input
            ref={mobileSearchRef}
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск предметов..."
            className="input-field pl-10 py-2.5 w-full"
          />
        </form>
      )}

      {menuOpen && (
        <nav className="lg:hidden flex flex-col gap-1 px-4 pb-4 text-sm text-white/80">
          <Link href="/games" className="py-2" onClick={() => setMenuOpen(false)}>
            {t("nav_games")}
          </Link>
          <Link href="/catalog?new=1" className="py-2" onClick={() => setMenuOpen(false)}>
            {t("nav_new")}
          </Link>
        </nav>
      )}
    </header>
  );
}
