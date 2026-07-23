"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Package,
  Gamepad2,
  Megaphone,
  Settings,
  ArrowLeftCircle,
  Wallet,
  MessageSquare,
  SlidersHorizontal,
  AlertTriangle,
  Tag,
  Gift,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { isAdminUid } from "@/lib/users";

const NAV = [
  { href: "/admin", label: "Дашборд", icon: LayoutDashboard },
  { href: "/admin/users", label: "Пользователи", icon: Users },
  { href: "/admin/products", label: "Товары", icon: Package },
  { href: "/admin/games", label: "Игры", icon: Gamepad2 },
  { href: "/admin/topups", label: "Баланс / заявки", icon: Wallet },
  { href: "/admin/disputes", label: "Жалобы", icon: AlertTriangle },
  { href: "/admin/sell-requests", label: "Заявки на продажу", icon: Tag },
  { href: "/admin/chats", label: "Чаты", icon: MessageSquare },
  { href: "/admin/promocodes", label: "Промокоды", icon: Gift },
  { href: "/admin/ads", label: "Реклама и рассылки", icon: Megaphone },
  { href: "/admin/settings", label: "Настройки сайта", icon: Settings },
  { href: "/admin/features", label: "Функции", icon: SlidersHorizontal },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (loading) return;
    if (!user || !isAdminUid(user.uid)) {
      router.push("/");
    }
  }, [loading, user, router]);

  if (loading || !user || !isAdminUid(user.uid)) {
    return <div className="max-w-5xl mx-auto px-4 py-20 text-center text-white/40">Проверка доступа...</div>;
  }

  const navContent = (
    <>
      <div className="flex items-center gap-2 font-bold mb-6 px-2">
        <span>
          VELOX <span className="text-accent">TRADE</span>
        </span>
      </div>
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm transition-colors ${
              active ? "bg-accent/15 text-accent" : "text-white/60 hover:bg-white/5"
            }`}
          >
            <Icon size={16} /> {item.label}
          </Link>
        );
      })}
      <Link
        href="/"
        className="flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm text-white/40 hover:bg-white/5 mt-auto"
      >
        <ArrowLeftCircle size={16} /> На сайт
      </Link>
    </>
  );

  return (
    <div className="flex min-h-[calc(100vh-64px)] relative">
      {/* Мобильная шапка с кнопкой открытия меню */}
      <div className="md:hidden fixed top-16 left-0 right-0 z-40 glass border-b border-border px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-sm">
          VELOX <span className="text-accent">TRADE</span>
        </span>
        <button onClick={() => setMobileOpen(true)} className="btn-secondary p-2">
          <Menu size={18} />
        </button>
      </div>

      {/* Оверлей-меню для мобильных */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-72 bg-bg border-r border-border p-4 flex flex-col gap-1 overflow-y-auto">
            <div className="flex justify-end mb-2">
              <button onClick={() => setMobileOpen(false)} className="btn-secondary p-2">
                <X size={18} />
              </button>
            </div>
            {navContent}
          </div>
          <div className="flex-1 bg-black/60" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <aside className="w-60 border-r border-border p-4 hidden md:flex flex-col gap-1 shrink-0">{navContent}</aside>
      <div className="flex-1 p-5 md:p-8 pt-20 md:pt-8 overflow-x-auto">{children}</div>
    </div>
  );
}
