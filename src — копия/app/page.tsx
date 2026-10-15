"use client";

import Link from "next/link";
import Image from "next/image";
import { ReactNode, useEffect, useState } from "react";
import { ArrowUpRight, Dices } from "lucide-react";
import { getGames, getProducts } from "@/lib/products";
import { getPublicStats } from "@/lib/stats";
import { Game, Product } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";
import { ProductCard } from "@/components/ProductCard";
import { PromoCarousel } from "@/components/PromoCarousel";
import { QuickTopupCard } from "@/components/QuickTopupCard";
import { AdSlotCard } from "@/components/AdSlotCard";
import { SiteRatingWidget } from "@/components/SiteRatingWidget";
import { RecentlyViewedSection } from "@/components/RecentlyViewedSection";
import { LiveActivityFeed } from "@/components/LiveActivityFeed";

function SectionHead({ title, href, hint, extra }: { title: string; href?: string; hint?: string; extra?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div>
        <h2 className="font-display text-xl sm:text-2xl font-semibold">{title}</h2>
        {hint && <p className="text-sm text-white/40 mt-1">{hint}</p>}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {extra}
        {href && (
          <Link href={href} className="text-sm text-white/55 hover:text-accent transition-colors inline-flex items-center gap-1">
            Все <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [fresh, setFresh] = useState<Product[]>([]);
  const [dealsCount, setDealsCount] = useState(0);

  useEffect(() => {
    getGames()
      .then(setGames)
      .catch((err) => { console.error("Ошибка загрузки игр:", err); setGames([]); })
      .finally(() => setLoaded(true));
    getProducts({ excludeWheelLocked: true })
      .then((products) => {
        const now = Date.now();
        setFeatured(products.filter((p) => p.boostTier === "home" && (p.boostUntil ?? 0) > now).slice(0, 6));
        setFresh(
          [...products]
            .filter((p) => p.stock > 0)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 12)
        );
      })
      .catch(() => { setFeatured([]); setFresh([]); });
    getPublicStats()
      .then((s) => setDealsCount(s.dealsCount))
      .catch(() => setDealsCount(0));
  }, []);

  return (
    <>
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      {/* Баннер — первое, что видно на странице (если реклама не добавлена, блок не занимает места). */}
      <div className="pt-4 lg:pt-6">
        <PromoCarousel />
      </div>

      {/* Игры: ряд плиток-иконок с подписью, прокручивается вбок. */}
      <section className="pt-8 lg:pt-10">
        <SectionHead
          title="Игры"
          href="/games"
          extra={
            dealsCount > 0 ? (
              <span className="hidden sm:flex items-center gap-2 text-xs text-white/45">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                {dealsCount.toLocaleString("ru-RU")} сделок
              </span>
            ) : null
          }
        />
        {!loaded ? (
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="flex-none w-[84px]">
                <div className="w-[84px] h-[84px] rounded-[20px] bg-white/5 animate-pulse" />
                <div className="h-2.5 w-14 mt-2.5 rounded bg-white/5 animate-pulse" />
              </div>
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="card p-8 text-center text-white/40 text-sm">Игры появятся здесь, как только администратор добавит их в админ-панели.</div>
        ) : (
          <div className="flex gap-4 sm:gap-5 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
            {games.map((game) => (
              <Link key={game.id} href={`/catalog?game=${game.slug}`} className="flex-none w-[84px] group">
                <div className="relative w-[84px] h-[84px] rounded-[20px] overflow-hidden bg-surface border border-border group-hover:border-accent transition-colors">
                  <Image src={safeImageSrc(game.image)} alt={game.name} fill className="object-cover" sizes="84px" />
                </div>
                <span className="block text-[12.5px] text-center text-white/70 group-hover:text-white mt-2.5 truncate transition-colors">{game.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Быстрые действия: колесо, реклама, пополнение. */}
      <section className="pt-8 lg:pt-10 grid lg:grid-cols-[1fr_1fr_1fr] gap-4">
        <Link
          href="/profile/wheel"
          className="group flex items-center gap-4 rounded-[18px] bg-accent text-black p-5 hover:bg-accent-light transition-colors"
        >
          <span className="w-12 h-12 rounded-[14px] bg-black text-accent grid place-items-center shrink-0">
            <Dices size={24} />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[17px] font-semibold leading-tight">Колесо фортуны</span>
            <span className="block text-sm text-black/65 mt-0.5">Крути раз в несколько часов и забирай предметы</span>
          </span>
          <ArrowUpRight size={20} className="ml-auto shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
        </Link>
        <AdSlotCard />
        <QuickTopupCard />
      </section>

      <div className="pt-8">
        <LiveActivityFeed />
      </div>

      {featured.length > 0 && (
        <section className="pt-12">
          <SectionHead title="Рекомендуем" hint="Предметы, которые продавцы вывели на главную" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {fresh.length > 0 && (
        <section className="pt-12">
          <SectionHead title="Новые предметы" href="/catalog" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {fresh.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

    </div>
    <RecentlyViewedSection />
    <SiteRatingWidget />
    </>
  );
}
