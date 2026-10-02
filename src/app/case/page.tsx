"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveCases, getCaseItemRarity } from "@/lib/cases";
import { RARITY_COLOR } from "@/lib/rarityColors";
import { safeImageSrc } from "@/lib/safeImage";
import { CaseData } from "@/types";
import { PackageOpen, Ticket } from "lucide-react";

/** Тонкая полоска внизу карточки кейса — не декорация, а честная выжимка его же таблицы дропа:
 * какие тиры редкости вообще есть внутри, от частых к редким слева направо. Даёт понять "что
 * там может быть" ещё до клика, без необходимости объяснять это текстом. */
function LootStrip({ c }: { c: CaseData }) {
  const totalWeight = c.items.reduce((s, it) => s + it.weight, 0);
  const tiers = Array.from(new Set(c.items.map((it) => getCaseItemRarity(it.weight, totalWeight))));
  const order: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
  tiers.sort((a, b) => order[a] - order[b]);
  if (tiers.length === 0) return <div className="h-1 rounded-full bg-white/5" />;
  return (
    <div className="h-1 rounded-full overflow-hidden flex">
      {tiers.map((t) => (
        <div key={t} className="flex-1" style={{ background: RARITY_COLOR[t] }} />
      ))}
    </div>
  );
}

export default function CasesPage() {
  const [cases, setCases] = useState<CaseData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getActiveCases()
      .then(setCases)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1.5 flex items-center gap-2.5">
            <PackageOpen className="text-accent" size={26} /> Кейсы
          </h1>
          <p className="text-sm text-white/40 max-w-md">
            Открывай за тикеты — выпавший предмет придёт настоящим заказом, как обычная покупка.
          </p>
        </div>
        <Link href="/profile/tickets" className="btn-secondary px-4 py-2.5 text-sm flex items-center gap-2 shrink-0">
          <Ticket size={16} className="text-accent" /> Получить тикеты
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-5 h-48 animate-pulse bg-white/[0.02]" />
          ))}
        </div>
      ) : cases.length === 0 ? (
        <div className="card p-14 text-center text-white/40">Кейсов пока нет — загляни позже.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
          {cases.map((c) => (
            <Link
              key={c.id}
              href={`/case/${c.id}`}
              className="group card p-5 flex flex-col items-center text-center gap-3 relative overflow-hidden"
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: "radial-gradient(circle at 50% 30%, rgba(255,152,0,0.14), transparent 65%)" }}
              />
              <div className="relative w-24 h-24 flex items-center justify-center">
                <div
                  className="absolute inset-0 rounded-full blur-2xl opacity-40 group-hover:opacity-70 transition-opacity duration-500"
                  style={{ background: "var(--color-accent)" }}
                />
                <img src={safeImageSrc(c.image)} alt={c.name} className="relative w-full h-full rounded-btn object-cover" />
              </div>
              <p className="font-medium text-sm leading-tight relative">{c.name}</p>
              <p className="text-accent font-bold relative flex items-center gap-1">
                {c.priceTickets} <Ticket size={14} />
              </p>
              <div className="w-full relative">
                <LootStrip c={c} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
