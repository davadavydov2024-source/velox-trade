"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { getProducts } from "@/lib/products";
import { Product, Rarity, RARITY_LABEL } from "@/types";

const RARITIES: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

function CatalogInner() {
  const params = useSearchParams();
  const gameSlug = params.get("game") ?? "";
  const initialQuery = params.get("q") ?? "";
  const onlyNew = params.get("new") === "1";

  const [products, setProducts] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState(initialQuery);
  const [rarity, setRarity] = useState<Rarity | "">("");
  const [sort, setSort] = useState<"newest" | "price_asc" | "price_desc">("newest");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    getProducts({ sort })
      .then((p) => setProducts(p))
      .catch((err) => { console.error("Ошибка загрузки товаров:", err); setProducts([]); })
      .finally(() => setLoaded(true));
  }, [sort]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (gameSlug && p.gameId !== gameSlug) return false;
      if (onlyNew && !p.isNew) return false;
      if (rarity && p.rarity !== rarity) return false;
      if (onlyAvailable && p.stock <= 0) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [products, gameSlug, onlyNew, rarity, onlyAvailable, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">
          {gameSlug ? `Каталог — ${gameSlug.replace(/-/g, " ")}` : "Каталог товаров"}
        </h1>
        <button className="md:hidden btn-secondary py-2 px-3" onClick={() => setFiltersOpen((v) => !v)}>
          <SlidersHorizontal size={18} />
        </button>
      </div>

      <div className="grid md:grid-cols-[240px_1fr] gap-8">
        {/* Filters */}
        <aside className={`${filtersOpen ? "block" : "hidden"} md:block space-y-6`}>
          <div>
            <label className="text-xs text-white/40 mb-2 block">Поиск</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Название предмета..."
              className="input-field py-2.5 text-sm"
            />
          </div>

          <div>
            <p className="text-xs text-white/40 mb-2">Редкость</p>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => setRarity("")}
                className={`text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  rarity === "" ? "bg-accent/15 text-accent" : "text-white/60 hover:bg-white/5"
                }`}
              >
                Все
              </button>
              {RARITIES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRarity(r)}
                  className={`text-left text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    rarity === r ? "bg-accent/15 text-accent" : "text-white/60 hover:bg-white/5"
                  }`}
                >
                  {RARITY_LABEL[r]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-white/40 mb-2">Сортировка</p>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="input-field py-2.5 text-sm"
            >
              <option value="newest">Новинки</option>
              <option value="price_asc">Цена: по возрастанию</option>
              <option value="price_desc">Цена: по убыванию</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
            Только в наличии
          </label>
        </aside>

        {/* Grid */}
        <div>
          {!loaded ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="card p-3 aspect-[3/4] animate-pulse bg-white/5" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="card p-10 text-center text-white/40">
              {products.length === 0
                ? "Товары появятся здесь, как только администратор добавит их в каталог."
                : "Ничего не найдено по заданным фильтрам."}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-3 aspect-[3/4] animate-pulse bg-white/5" />
          ))}
        </div>
      }
    >
      <CatalogInner />
    </Suspense>
  );
}
