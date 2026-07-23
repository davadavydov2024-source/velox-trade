"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search, ShoppingCart, Wallet, User as UserIcon, Menu, X, Swords } from "lucide-react";
import { useCart } from "@/lib/cartStore";
import { useAuth } from "@/lib/authContext";

export function Header() {
  const cartCount = useCart((s) => s.count());
  const { user, profile } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Корзина читается из localStorage, которого нет на сервере — поэтому первая отрисовка
  // на сервере и в браузере отличается. Показываем бейдж только после монтирования на клиенте,
  // чтобы избежать ошибки гидратации Next.js.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-50 glass border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg shrink-0">
          <Swords className="text-accent" size={24} />
          <span>
            VELOX <span className="text-accent">TRADE</span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-6 text-sm text-white/70 shrink-0">
          <Link href="/games" className="hover:text-white transition-colors">
            Игры
          </Link>
          <Link href="/catalog" className="hover:text-white transition-colors">
            Каталог
          </Link>
          <Link href="/catalog?new=1" className="hover:text-white transition-colors">
            Новинки
          </Link>
          <Link href="/chats" className="hover:text-white transition-colors">
            Чаты
          </Link>
        </nav>

        <form
          action="/catalog"
          className="hidden md:flex flex-1 max-w-md relative"
          onSubmit={(e) => {
            e.preventDefault();
            window.location.href = `/catalog?q=${encodeURIComponent(search)}`;
          }}
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск предметов..."
            className="input-field pl-10 py-2.5"
          />
        </form>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {mounted && profile && (
            <Link href="/profile/topup" className="hidden sm:flex items-center gap-1.5 btn-secondary py-2 px-3 text-sm">
              <Wallet size={16} className="text-accent" />
              {profile.balance.toLocaleString("ru-RU")} ₽
            </Link>
          )}
          <Link href="/cart" className="relative btn-secondary py-2 px-3">
            <ShoppingCart size={18} />
            {mounted && cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-accent text-black text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>
          {user ? (
            <Link href="/profile" className="btn-secondary py-2 px-3">
              <UserIcon size={18} />
            </Link>
          ) : (
            <Link href="/auth/login" className="btn-primary py-2 px-4 text-sm">
              Войти
            </Link>
          )}
          <button className="lg:hidden btn-secondary py-2 px-3" onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="lg:hidden flex flex-col gap-1 px-4 pb-4 text-sm text-white/80">
          <Link href="/games" className="py-2" onClick={() => setMenuOpen(false)}>
            Игры
          </Link>
          <Link href="/catalog" className="py-2" onClick={() => setMenuOpen(false)}>
            Каталог
          </Link>
          <Link href="/catalog?new=1" className="py-2" onClick={() => setMenuOpen(false)}>
            Новинки
          </Link>
          <Link href="/chats" className="py-2" onClick={() => setMenuOpen(false)}>
            Чаты
          </Link>
        </nav>
      )}
    </header>
  );
}
