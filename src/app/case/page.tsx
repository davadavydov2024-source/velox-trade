"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveCases } from "@/lib/cases";
import { safeImageSrc } from "@/lib/safeImage";
import { CaseData } from "@/types";
import { PackageOpen } from "lucide-react";

export default function CasesPage() {
  const [cases, setCases] = useState<CaseData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getActiveCases()
      .then(setCases)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <PackageOpen className="text-accent" size={24} /> Кейсы
        </h1>
        <p className="text-sm text-white/40">Открывай кейсы за баланс сайта и получай случайный выигрыш на счёт.</p>
      </div>

      {loading ? (
        <div className="card p-10 text-center text-white/40">Загрузка...</div>
      ) : cases.length === 0 ? (
        <div className="card p-10 text-center text-white/40">Кейсов пока нет — загляни позже.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {cases.map((c) => (
            <Link key={c.id} href={`/case/${c.id}`} className="card p-4 flex flex-col items-center text-center gap-2 hover:bg-white/[0.03] transition-colors">
              <img src={safeImageSrc(c.image)} alt={c.name} className="w-24 h-24 rounded-btn object-cover bg-black/30" />
              <p className="font-medium text-sm">{c.name}</p>
              <p className="text-accent font-bold text-sm">{c.price} ₽</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
