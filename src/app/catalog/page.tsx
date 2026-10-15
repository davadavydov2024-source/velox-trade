"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SlidersHorizontal, Star, Search, X } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { getProducts, getGameBySlug, getGames } from "@/lib/products";
import { Game, Product, Rarity, RARITY_LABEL, getPaymentMode } from "@/types";

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
  const [gameCategories, setGameCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<"newest" | "price_asc" | "price_desc">("newest");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  // "Оплата звёздами" — отдельный раздел/фильтр каталога: показывает только товары, для которых
  // продавец указал цену в Telegram Stars (см. profile/my-products и api/products/stars-price).
  // Поддерживает ?stars=1 в ссылке — так же, как ?new=1 для новинок — чтобы можно было прислать
  // прямую ссылку на этот раздел.
  const [onlyStars, setOnlyStars] = useState(params.get("stars") === "1");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    getGames().then(setGames).catch(() => setGames([]));
  }, []);

  useEffect(() => {
    getProducts({ sort, excludeWheelLocked: true })
      .then((p) => setProducts(p))
      .catch((err) => { console.error("Ошибка загрузки товаров:", err); setProducts([]); })
      .finally(() => setLoaded(true));
  }, [sort]);

  // Категории зависят от конкретной игры — при смене ?game= подгружаем список категорий этой
  // игры (задаются админом на /admin/games) и сбрасываем выбранную категорию, если она есть.
  useEffect(() => {
    setCategory("");
    if (!gameSlug) {
      setGameCategories([]);
      return;
    }
    let cancelled = false;
    getGameBySlug(gameSlug)
      .then((g) => !cancelled && setGameCategories(g?.categories ?? []))
      .catch(() => !cancelled && setGameCategories([]));
    return () => {
      cancelled = true;
    };
  }, [gameSlug]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const boostRank = (p: Product) => {
      if ((p.boostUntil ?? 0) <= now) return 0;
      return p.boostTier === "home" ? 2 : 1;
    };
    return products
      .filter((p) => {
        if (gameSlug && p.gameId !== gameSlug) return false;
        if (category && p.category !== category) return false;
        if (onlyNew && !p.isNew) return false;
        if (rarity && p.rarity !== rarity) return false;
        if (onlyAvailable && p.stock <= 0) return false;
        if (onlyStars && getPaymentMode(p) === "rub") return false;
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => boostRank(b) - boostRank(a));
  }, [products, gameSlug, category, onlyNew, rarity, onlyAvailable, onlyStars, search]);

  const currentGame = games.find((g) => g.slug === gameSlug);
  const title = currentGame?.name ?? (gameSlug ? gameSlug.replace(/-/g, " ") : "Каталог");
  const activeFilters = [rarity, category, onlyAvailable, onlyStars].filter(Boolean).length;

  const chip = (on: boolean) => `chip ${on ? "chip-on" : ""}`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-12">
      {/* Быстрое переключение игры — ряд плиток вместо прыжка на отдельную страницу. */}
      {games.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 mb-6">
          <Link href="/catalog" className={chip(!gameSlug)}>Все игры</Link>
          {games.map((g) => (
            <Link key={g.id} href={`/catalog?game=${g.slug}`} className={chip(gameSlug === g.slug)}>
              {g.name}
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold capitalize">{title}</h1>
          <p className="text-sm text-white/40 mt-1.5">{loaded ? `${filtered.length} ${filtered.length === 1 ? "предмет" : "предметов"}` : "Загрузка…"}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="input-field py-2 px-3 text-sm w-auto hidden sm:block"
            aria-label="Сортировка"
          >
            <option value="newest">Сначала новые</option>
            <option value="price_asc">Дешевле</option>
            <option value="price_desc">Дороже</option>
          </select>
          <button className="md:hidden btn-secondary py-2 px-3 relative" onClick={() => setFiltersOpen((v) => !v)} aria-label="Фильтры">
            <SlidersHorizontal size={18} />
            {activeFilters > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-accent text-black text-[10px] font-bold rounded-full w-5 h-5 grid place-items-center">{activeFilters}</span>
            )}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-[250px_1fr] gap-6 lg:gap-8 items-start">
        <aside className={`${filtersOpen ? "block" : "hidden"} md:block md:sticky md:top-[88px] rounded-[18px] bg-surface border border-border p-4 space-y-5`}>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Название предмета"
              className="input-field py-2.5 pl-10 text-sm"
            />
          </div>

          <div className="sm:hidden">
            <p className="text-xs uppercase tracking-wider text-white/35 mb-2">Сортировка</p>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="input-field py-2.5 text-sm">
              <option value="newest">Сначала новые</option>
              <option value="price_asc">Дешевле</option>
              <option value="price_desc">Дороже</option>
            </select>
          </div>

          {gameCategories.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-white/35 mb-2">Категория</p>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setCategory("")} className={`${chip(category === "")} !py-1.5 !text-xs`}>Все</button>
                {gameCategories.map((c) => (
                  <button key={c} onClick={() => setCategory(c)} className={`${chip(category === c)} !py-1.5 !text-xs`}>{c}</button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs uppercase tracking-wider text-white/35 mb-2">Редкость</p>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setRarity("")} className={`${chip(rarity === "")} !py-1.5 !text-xs`}>Любая</button>
              {RARITIES.map((r) => (
                <button key={r} onClick={() => setRarity(r)} className={`${chip(rarity === r)} !py-1.5 !text-xs`}>{RARITY_LABEL[r]}</button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <label className="flex items-center gap-2.5 text-sm text-white/75 cursor-pointer">
              <input autoComplete="off" type="checkbox" className="accent-[var(--color-accent)] w-4 h-4" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
              Только в наличии
            </label>
            {/* Раздел "Оплата звёздами" — товары, у которых продавец включил оплату Telegram Stars. */}
            <label className="flex items-center gap-2.5 text-sm text-white/75 cursor-pointer">
              <input autoComplete="off" type="checkbox" className="accent-[var(--color-accent)] w-4 h-4" checked={onlyStars} onChange={(e) => setOnlyStars(e.target.checked)} />
              <span className="flex items-center gap-1.5">Оплата Stars <Star size={13} className="text-accent fill-accent" /></span>
            </label>
          </div>

          {(activeFilters > 0 || search) && (
            <button
              onClick={() => { setRarity(""); setCategory(""); setOnlyAvailable(false); setOnlyStars(false); setSearch(""); }}
              className="w-full text-sm text-white/50 hover:text-white inline-flex items-center justify-center gap-1.5 pt-1"
            >
              <X size={14} /> Сбросить
            </button>
          )}
        </aside>

        <div>
          {!loaded ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-[16px] aspect-[3/4] animate-pulse bg-white/5" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-border p-12 text-center text-white/40 text-sm">
              {products.length === 0
                ? "Товары появятся здесь, как только администратор добавит их в каталог."
                : "Ничего не найдено. Попробуй убрать часть фильтров."}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
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
            <div key={i} className="rounded-[16px] aspect-[3/4] animate-pulse bg-white/5" />
          ))}
        </div>
      }
    >
      <CatalogInner />
    </Suspense>
  );
}
