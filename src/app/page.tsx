"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { getGames, getProducts } from "@/lib/products";
import { Game, Product } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";
import { ProductCard } from "@/components/ProductCard";

export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [featured, setFeatured] = useState<Product[]>([]);

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
  }, []);

  return (
    <div>
      {/* Mobile hero — компактный, с реальными данными вместо статичного лого */}
      <section className="lg:hidden border-b border-border px-4 pt-4 pb-6 space-y-4">
        <div>
          <span className="inline-flex items-center gap-1.5 text-accent text-xs font-semibold bg-accent/10 px-3 py-1.5 rounded-full mb-3">
            <Sparkles size={13} /> №1 маркетплейс игровых предметов
          </span>
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 md:py-28 grid md:grid-cols-2 gap-12 items-center relative">
          <div>
            <span className="inline-flex items-center gap-1.5 text-accent text-xs font-semibold bg-accent/10 px-3 py-1.5 rounded-full mb-5">
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
              <Link href="/games" className="btn-secondary px-6 py-3.5">
                Смотреть все игры
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

          <div className="relative h-64 md:h-96 flex items-center justify-center">
            <div
              className="absolute inset-0 rounded-full blur-3xl opacity-30"
              style={{ background: "radial-gradient(circle, rgba(255,152,0,0.4), transparent 70%)" }}
            />
            <div className="relative w-56 h-56 md:w-72 md:h-72 animate-glow">
              <Image src="/icons/logo-nobg.png" alt="Velox Trade" fill className="object-contain drop-shadow-2xl" sizes="288px" priority />
            </div>
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
