"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, Plus, MessageSquare, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { safeImageSrc } from "@/lib/safeImage";

const SELL_HREF = "/profile/sell";

/**
 * Нижняя шторка навигации (только мобильные). Плавающая «стеклянная» панель с отступами от краёв,
 * в центре — выделенная кнопка «Продать», у залогиненного вместо иконки профиля его аватар.
 * main в layout.tsx имеет нижний отступ под эту панель (pb-24).
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const { user, profile } = useAuth();

  if (pathname.startsWith("/admin")) return null;

  const left = [
    { href: "/", label: "Главная", icon: Home },
    { href: "/catalog", label: "Каталог", icon: LayoutGrid },
  ];
  const right = [
    { href: "/chats", label: "Чаты", icon: MessageSquare },
    user ? { href: "/profile", label: "Профиль", icon: UserIcon } : { href: "/auth/login", label: "Войти", icon: UserIcon },
  ];

  // Активной считаем самую «глубокую» подходящую вкладку: /profile/sell не подсвечивает «Профиль».
  const all = [...left, { href: SELL_HREF }, ...right];
  const activeHref = all
    .map((t) => t.href)
    .filter((href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/")))
    .sort((a, b) => b.length - a.length)[0];

  // Обычная функция, а не вложенный компонент: иначе вкладки пересоздавались бы на каждый рендер и
  // анимации перехода между ними сбрасывались бы.
  const renderTab = ({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Home }) => {
    const active = href === activeHref;
    const isProfile = href === "/profile" && !!user && !!profile?.photoURL;
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className="relative flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 group select-none"
      >
        {/* Мягкая «капсула» под активной вкладкой */}
        <span
          className={`absolute inset-x-1.5 top-1 bottom-0.5 rounded-2xl transition-all duration-300 ${
            active ? "bg-accent/15 opacity-100 scale-100" : "opacity-0 scale-90"
          }`}
        />
        <span className={`relative transition-transform duration-300 ${active ? "-translate-y-0.5 scale-110" : "group-active:scale-90"}`}>
          {isProfile ? (
            <span className={`block relative w-[22px] h-[22px] rounded-full overflow-hidden ring-2 transition-colors ${active ? "ring-accent" : "ring-white/25"}`}>
              <Image src={safeImageSrc(profile!.photoURL, "/placeholder.svg")} alt="" fill className="object-cover" sizes="22px" />
            </span>
          ) : (
            <Icon size={22} strokeWidth={active ? 2.4 : 1.9} className={`transition-colors ${active ? "text-accent" : "text-white/45"}`} />
          )}
        </span>
        <span className={`relative text-[10.5px] leading-none font-medium transition-colors ${active ? "text-accent" : "text-white/40"}`}>{label}</span>
        <span
          className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] rounded-full bg-accent transition-all duration-300 ${
            active ? "w-4 opacity-100 shadow-[0_0_8px_var(--color-accent)]" : "w-0 opacity-0"
          }`}
        />
      </Link>
    );
  };

  const sellActive = activeHref === SELL_HREF;

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-3 pointer-events-none"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
      aria-label="Основная навигация"
    >
      <div className="pointer-events-auto relative mx-auto max-w-md flex items-end rounded-[28px] bg-surface/80 backdrop-blur-xl border border-white/[0.08] shadow-[0_12px_40px_-10px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.06)] px-1.5">
        {left.map(renderTab)}

        {/* Центральная кнопка «Продать» — приподнята над панелью */}
        <Link href={SELL_HREF} aria-label="Продать" className="relative flex-1 flex justify-center select-none">
          <span
            className={`-mt-6 mb-2 w-14 h-14 rounded-full flex items-center justify-center text-black ring-[5px] ring-bg bg-gradient-to-br from-accent to-accent-dark transition-all duration-300 active:scale-90 ${
              sellActive ? "shadow-[0_0_28px_2px_var(--color-accent)] scale-105" : "shadow-[0_8px_22px_-4px_var(--color-accent)]"
            }`}
          >
            <Plus size={28} strokeWidth={3} className={`transition-transform duration-300 ${sellActive ? "rotate-90" : ""}`} />
          </span>
        </Link>

        {right.map(renderTab)}
      </div>
    </nav>
  );
}
