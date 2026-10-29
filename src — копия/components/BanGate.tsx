"use client";

import { ReactNode } from "react";
import { ShieldOff } from "lucide-react";
import { useAuth, isEffectivelyBanned } from "@/lib/authContext";

export function BanGate({ children }: { children: ReactNode }) {
  const { profile, logout } = useAuth();

  if (!isEffectivelyBanned(profile)) return <>{children}</>;

  const until = profile?.banUntil;
  const untilText =
    !until || until === "forever" ? "бессрочно" : `до ${new Date(until).toLocaleString("ru-RU")}`;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg">
      <div className="card p-8 max-w-md text-center space-y-4">
        <ShieldOff className="mx-auto text-red-400" size={40} />
        <h1 className="text-xl font-bold">Аккаунт заблокирован</h1>
        <p className="text-white/60 text-sm">
          {profile?.banReason ? `Причина: ${profile.banReason}` : "Причина не указана."}
        </p>
        <p className="text-white/40 text-xs">Срок блокировки: {untilText}</p>
        <p className="text-white/40 text-xs">
          Если считаешь, что это ошибка — напиши администратору в Telegram-бота, указанного на сайте.
        </p>
        <button onClick={() => logout()} className="btn-secondary px-5 py-2.5 text-sm">
          Выйти из аккаунта
        </button>
      </div>
    </div>
  );
}
