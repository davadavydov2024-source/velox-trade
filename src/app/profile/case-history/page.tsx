"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PackageOpen } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getMyCaseOpenings } from "@/lib/cases";
import { safeImageSrc } from "@/lib/safeImage";
import { CaseOpening } from "@/types";

export default function CaseHistoryPage() {
  const { user } = useAuth();
  const [openings, setOpenings] = useState<CaseOpening[] | null>(null);

  useEffect(() => {
    if (!user) return;
    getMyCaseOpenings(user.uid).then(setOpenings);
  }, [user]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <PackageOpen size={20} className="text-accent" /> История кейсов
        </h1>
        <Link href="/case" className="btn-secondary px-4 py-2 text-sm">
          Открыть кейс
        </Link>
      </div>

      {openings === null ? (
        <div className="card p-10 text-center text-white/40">Загрузка...</div>
      ) : openings.length === 0 ? (
        <div className="card p-10 text-center text-white/40">Ты ещё не открывал(а) кейсы.</div>
      ) : (
        <div className="space-y-2">
          {openings.map((o) => (
            <Link key={o.id} href="/profile/orders" className="card p-3 flex items-center gap-3 hover:bg-white/[0.03] transition-colors">
              <img src={safeImageSrc(o.wonItemImage)} alt={o.wonItemName} className="w-11 h-11 rounded-btn object-cover bg-black/30 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{o.wonItemName}</p>
                <p className="text-xs text-white/40">
                  Кейс «{o.caseName}» · {new Date(o.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <p className="text-xs text-white/30 shrink-0">−{o.pricePaidTickets} 🎫</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
