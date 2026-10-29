"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { getGames } from "@/lib/products";
import { Game } from "@/types";
import { safeImageSrc } from "@/lib/safeImage";

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getGames()
      .then(setGames)
      .catch((err) => { console.error("Ошибка загрузки игр:", err); setGames([]); })
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-display text-2xl sm:text-3xl font-semibold mb-8">Все игры</h1>

      {!loaded ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card aspect-square animate-pulse bg-white/5" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <div className="card p-10 text-center text-white/40">
          Игры появятся здесь, как только администратор добавит их в админ-панели.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
          {games.map((game) => (
            <Link
              key={game.id}
              href={`/catalog?game=${game.slug}`}
              className="rounded-[18px] bg-surface border border-border hover:border-accent p-5 flex flex-col items-center gap-3 transition-colors"
            >
              <div className="relative w-20 h-20 rounded-[20px] overflow-hidden bg-black/30">
                <Image src={safeImageSrc(game.image)} alt={game.name} fill className="object-cover" sizes="80px" />
              </div>
              <span className="font-medium text-center">{game.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
