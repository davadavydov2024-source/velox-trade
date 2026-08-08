"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowRight, Sparkles, Flame } from "lucide-react";
import { getGames, getProducts } from "@/lib/products";
import { getPublicStats } from "@/lib/stats";
import { Game, Product } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";
import { ProductCard } from "@/components/ProductCard";

const ACCENTS = ["#ff9800", "#4a6cf7", "#22c55e", "#e879f9", "#38bdf8"];

export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [dealsCount, setDealsCount] = useState(0);

  useEffect(() => {
    getGames()
      .then(setGames)
      .catch((err) => { console.error("Ошибка загрузки игр:", err); setGames([]); })
      .finally(() => setLoaded(true));
    getProducts()
      .then((products) => {
        const now = Date.now();
        setFeatured(products.filter((p) => p.boostTier === "home" && (p.boostUntil ?? 0) > now).slice(0, 6));
      })
      .catch(() => setFeatured([]));
    getPublicStats()
      .then((s) => setDealsCount(s.dealsCount))
      .catch(() => setDealsCount(0));
  }, []);

  return (
    <div>
      {/* Mobile hero — компактный, с реальными данными вместо статичного лого */}
      <section className="lg:hidden border-b border-border px-4 pt-4 pb-6 space-y-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-accent text-xs font-semibold bg-accent/10 px-3 py-1.5 rounded-full mb-3">
            <Sparkles size={13} /> №1 маркетплейс игровых предметов
          </span>
          {dealsCount > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-white/40 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> {dealsCount.toLocaleString("ru-RU")} сделок совершено
            </span>
          )}
          <h1 className="text-2xl font-extrabold leading-tight mb-1.5 tracking-tight">Лучший магазин игровых предметов</h1>
          <p className="text-white/50 text-sm">Roblox-предметы быстро, безопасно и по честным ценам</p>
        </div>

        <Link
          href="/profile/wheel"
          className="block rounded-2xl p-4 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, var(--color-accent), var(--color-accent-dark))" }}
        >
          <p className="text-black/60 text-[11px] font-semibold mb-1">Колесо фортуны</p>
          <p className="text-black font-bold text-base">Крути и выигрывай предметы</p>
        </Link>

        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-sm font-semibold text-white/70">Игры</p>
            <Link href="/games" className="text-accent text-xs">
              Все игры →
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
            {(loaded ? games.slice(0, 8) : Array.from({ length: 5 })).map((game, i) =>
              loaded && game ? (
                <Link key={(game as Game).id} href={`/catalog?game=${(game as Game).slug}`} className="flex-none flex flex-col items-center gap-1.5 w-14">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-black/30 ring-1 ring-white/5">
                    <Image src={safeImageSrc((game as Game).image)} alt={(game as Game).name} fill className="object-cover" sizes="48px" />
                  </div>
                  <span className="text-[10px] text-center text-white/60 leading-tight truncate w-full">{(game as Game).name}</span>
                </Link>
              ) : (
                <div key={i} className="flex-none w-12 h-12 rounded-xl bg-white/5 animate-pulse" />
              )
            )}
          </div>
        </div>

        <div className="flex gap-2.5">
          <Link href="/catalog" className="btn-primary flex-1 py-3 text-sm text-center">
            Начать покупки
          </Link>
          <Link href="/profile/sell" className="btn-secondary flex-1 py-3 text-sm text-center">
            Продать предмет
          </Link>
        </div>
      </section>

      {/* Hero (десктоп) */}
      <section className="hidden lg:block relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 md:py-24 grid md:grid-cols-2 gap-12 items-center relative">
          <div>
            {dealsCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-white/50 bg-white/5 px-3 py-1.5 rounded-full mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> {dealsCount.toLocaleString("ru-RU")} сделок совершено
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-accent text-xs font-semibold bg-accent/10 px-3 py-1.5 rounded-full mb-5 ml-2">
              <Sparkles size={14} /> №1 маркетплейс игровых предметов
            </span>
            <h1 className="text-4xl md:text-6xl font-extrabold leading-[1.1] mb-5 tracking-tight">
              Лучший магазин
              <br />
              <span className="bg-gradient-to-r from-accent to-accent-light bg-clip-text text-transparent">
                игровых предметов
              </span>
            </h1>
            <p className="text-white/50 mb-8 max-w-md text-lg">
              Покупай и продавай предметы из Roblox быстро, безопасно и по честным ценам — Grow a Garden, Adopt Me,
              Blox Fruits и десятки других игр.
            </p>
            <div className="flex flex-wrap gap-3 mb-10">
              <Link href="/catalog" className="btn-primary px-6 py-3.5 flex items-center gap-2 shadow-glow">
                Начать покупки <ArrowRight size={18} />
              </Link>
              <Link href="/profile/sell" className="btn-secondary px-6 py-3.5">
                Продать предмет
              </Link>
            </div>
            <div className="flex gap-8">
              {[
                { label: "Безопасные сделки", value: "100%" },
                { label: "Поддержка", value: "24/7" },
                { label: "Доставка предметов", value: "~5 мин" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="text-xl font-bold text-accent">{stat.value}</p>
                  <p className="text-xs text-white/40">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative pt-2">
            {!loaded ? (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className={`rounded-2xl bg-white/5 animate-pulse h-32 ${i === 0 ? "col-span-2" : ""}`} />
                ))}
              </div>
            ) : games.length === 0 ? (
              <div className="relative w-56 h-56 md:w-72 md:h-72 mx-auto">
                <Image src="/icons/logo-nobg.png" alt="Velox Trade" fill className="object-contain" sizes="288px" priority />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {games.slice(0, 5).map((game, i) => (
                  <Link
                    key={game.id}
                    href={`/catalog?game=${game.slug}`}
                    className={`relative card p-2.5 hover:-translate-y-1 transition-transform duration-300 ${i === 0 ? "col-span-2 row-span-1 -rotate-1 border-accent/60" : ""}`}
                  >
                    {i === 0 && (
                      <span className="absolute -top-2.5 left-3 bg-accent text-black text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Flame size={11} /> Хайп
                      </span>
                    )}
                    <div
                      className="relative w-full rounded-xl overflow-hidden bg-black/30"
                      style={{ height: i === 0 ? 96 : 76, borderLeft: `3px solid ${ACCENTS[i % ACCENTS.length]}` }}
                    >
                      <Image src={safeImageSrc(game.image)} alt={game.name} fill className="object-cover" sizes="180px" />
                    </div>
                    <p className="text-xs font-medium mt-2 truncate">{game.name}</p>
                  </Link>
                ))}
                <Link
                  href="/games"
                  className="card p-2.5 flex items-center justify-center text-accent text-xs font-medium bg-accent/5 border-accent/20 hover:bg-accent/10 transition-colors"
                >
                  Все игры →
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-b border-border">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">⭐ Рекомендуем</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Popular games */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Популярные игры</h2>
          <Link href="/games" className="text-accent text-sm hover:underline">
            Все игры →
          </Link>
        </div>
        {!loaded ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card aspect-square animate-pulse bg-white/5" />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="card p-10 text-center text-white/40">
            Игры появятся здесь, как только администратор добавит их в админ-панели.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {games.map((game) => (
              <Link
                key={game.id}
                href={`/catalog?game=${game.slug}`}
                className="card p-4 flex flex-col items-center gap-3 hover:-translate-y-1.5 hover:shadow-glow hover:border-accent/50 border border-transparent transition-all duration-300"
              >
                <div className="relative w-14 h-14 rounded-2xl overflow-hidden bg-black/30 ring-1 ring-white/5">
                  <Image src={safeImageSrc(game.image)} alt={game.name} fill className="object-cover" sizes="56px" />
                </div>
                <span className="text-xs text-center text-white/70 leading-tight">{game.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
