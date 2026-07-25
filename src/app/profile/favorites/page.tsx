"use client";

import { Heart } from "lucide-react";

export default function FavoritesPage() {
  return (
    <div className="card p-10 text-center">
      <Heart className="mx-auto text-white/20 mb-3" size={32} />
      <p className="text-white/40">У вас пока нет избранных товаров.</p>
      <p className="text-white/30 text-sm mt-1">Нажмите ♥ на странице товара, чтобы добавить его сюда.</p>
    </div>
  );
}
