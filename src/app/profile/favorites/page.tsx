"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { getUserFavoriteProducts } from "@/lib/favorites";
import { Product } from "@/types";
import { ProductCard } from "@/components/ProductCard";

export default function FavoritesPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getUserFavoriteProducts(user.uid)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Heart size={20} className="text-accent" /> Избранное
      </h1>

      {loading ? (
        <div className="card p-10 text-center text-white/40">Загрузка...</div>
      ) : products.length === 0 ? (
        <div className="card p-10 text-center">
          <Heart className="mx-auto text-white/20 mb-3" size={32} />
          <p className="text-white/40">У вас пока нет избранных товаров.</p>
          <p className="text-white/30 text-sm mt-1">Нажмите ♥ на карточке товара, чтобы добавить его сюда.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
