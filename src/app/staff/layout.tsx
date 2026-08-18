"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { MessageSquare, PackageCheck, ArrowLeftCircle } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { isAdminUid } from "@/lib/users";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isAdmin = !!user && isAdminUid(user.uid);
  const role = profile?.staffRole ?? null;
  const canManage = isAdmin || role === "manager"; // доступ к /staff/support
  const canHelp = isAdmin || role === "helper"; // доступ к /staff/deliveries
  const hasAnyAccess = canManage || canHelp;

  useEffect(() => {
    if (loading) return;
    if (!user || !hasAnyAccess) {
      router.push("/");
    }
  }, [loading, user, hasAnyAccess, router]);

  if (loading || !user || !hasAnyAccess) {
    return <div className="max-w-5xl mx-auto px-4 py-20 text-center text-white/40">Проверка доступа...</div>;
  }

  const NAV = [
    canManage && { href: "/staff/support", label: "Поддержка", icon: MessageSquare },
    canHelp && { href: "/staff/deliveries", label: "Выдача призов колеса", icon: PackageCheck },
  ].filter(Boolean) as { href: string; label: string; icon: typeof MessageSquare }[];

  return (
    <div className="flex min-h-[calc(100vh-64px)] relative">
      <aside className="w-60 border-r border-border p-4 hidden md:flex flex-col gap-1 shrink-0">
        <div className="flex items-center gap-2 font-bold mb-6 px-2">
          <span>
            VELOX <span className="text-accent">TRADE</span> <span className="text-white/30 text-xs font-normal">— персонал</span>
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
        <Link href="/" className="flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm text-white/40 hover:bg-white/5 mt-auto">
          <ArrowLeftCircle size={16} /> На сайт
        </Link>
      </aside>

      {/* Мобильная навигация — просто горизонтальные вкладки, раздел небольшой */}
      <div className="md:hidden fixed top-16 left-0 right-0 z-40 glass border-b border-border px-3 py-2 flex gap-2 overflow-x-auto">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 px-3 py-1.5 rounded-btn text-xs font-medium ${active ? "bg-accent text-black" : "bg-surface text-white/60"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="flex-1 p-5 md:p-8 pt-16 md:pt-8 overflow-x-auto">{children}</div>
    </div>
  );
}
