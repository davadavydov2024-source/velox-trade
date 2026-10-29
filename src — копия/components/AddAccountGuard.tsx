"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { cancelAddAccount, clearPendingAdd, getPendingAdd } from "@/lib/accountSlots";

/**
 * «Добавить аккаунт» работает так: создаётся новый пустой слот, и человек проходит обычные экраны
 * входа/регистрации уже в нём (см. startAddAccount). Этот компонент следит за тем, чтобы
 * человек не застрял в пустом слоте:
 *  • на страницах /auth/* показывает плашку «Добавляешь аккаунт — Отмена»;
 *  • если он ушёл с /auth/* , так никого и не добавив (закрыл вкладку, нажал «назад»), — возвращает
 *    прежний аккаунт, иначе сайт выглядел бы разлогиненным, хотя аккаунт на месте.
 */
export function AddAccountGuard() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (loading) return;
    const p = getPendingAdd();
    setPending(!!p);
    if (!p) return;
    if (user) {
      clearPendingAdd(); // успели войти — всё в порядке
      setPending(false);
      return;
    }
    if (!pathname.startsWith("/auth")) {
      cancelAddAccount();
      window.location.replace(pathname);
    }
  }, [pathname, user, loading]);

  if (!pending || !pathname.startsWith("/auth") || user) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[90] flex items-center justify-center gap-3 bg-accent/95 text-black text-xs font-medium px-4 py-2 shadow-lg">
      <span>Добавляешь ещё один аккаунт — текущий останется в списке</span>
      <button
        type="button"
        onClick={() => {
          cancelAddAccount();
          window.location.assign("/profile");
        }}
        className="flex items-center gap-1 rounded-full bg-black/15 hover:bg-black/25 px-2.5 py-1 transition-colors"
      >
        <X size={12} /> Отмена
      </button>
    </div>
  );
}
