"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { getGames } from "@/lib/products";
import { Game } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";

export default function HomePage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getGames()
      .then(setGames)
      .catch((err) => { console.error("Ошибка загрузки игр:", err); setGames([]); })
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
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

          <div className="relative h-64 md:h-96">
            <div
              className="absolute inset-0 rounded-full blur-3xl opacity-30"
              style={{ background: "radial-gradient(circle, rgba(255,152,0,0.4), transparent 70%)" }}
            />
            {[
              { top: "5%", left: "12%", size: 90, delay: "0s", rotate: "-8deg", emoji: "🗡️" },
              { top: "42%", left: "0%", size: 72, delay: "0.5s", rotate: "6deg", emoji: "🧪" },
              { top: "8%", left: "58%", size: 84, delay: "1s", rotate: "10deg", emoji: "💎" },
              { top: "55%", left: "62%", size: 104, delay: "1.5s", rotate: "-5deg", emoji: "🥚" },
              { top: "0%", left: "36%", size: 60, delay: "2s", rotate: "12deg", emoji: "🔥" },
              { top: "68%", left: "30%", size: 56, delay: "0.8s", rotate: "-10deg", emoji: "🦜" },
            ].map((item, i) => (
              <div
                key={i}
                className="absolute animate-glow flex items-center justify-center rounded-3xl glass"
                style={{
                  top: item.top,
                  left: item.left,
                  width: item.size,
                  height: item.size,
                  fontSize: item.size * 0.45,
                  transform: `rotate(${item.rotate})`,
                  background: "radial-gradient(circle, rgba(255,152,0,0.22), transparent 70%)",
                  animationDelay: item.delay,
                }}
              >
                {item.emoji}
              </div>
            ))}
          </div>
        </div>
      </section>

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
