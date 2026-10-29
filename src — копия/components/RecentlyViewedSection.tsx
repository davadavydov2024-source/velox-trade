"use client";

import { useEffect, useState } from "react";
import { getRecentlyViewedIds } from "@/lib/recentlyViewed";
import { getPurchasableProductById } from "@/lib/products";
import { Product } from "@/types";
import { ProductCard } from "@/components/ProductCard";

export function RecentlyViewedSection({ excludeId, title = "Вы недавно смотрели" }: { excludeId?: string; title?: string }) {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    const ids = getRecentlyViewedIds(excludeId).slice(0, 6);
    if (ids.length === 0) return;
    // getPurchasableProductById, а не обычный: товар, который с тех пор "заперли" под колесо
    // фортуны, просто исчезает отсюда — как будто снова недоступен для покупки.
    Promise.all(ids.map((id) => getPurchasableProductById(id).catch(() => null))).then((list) =>
      setProducts(list.filter((p): p is Product => p !== null))
    );
  }, [excludeId]);

  if (products.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-4">
      <h2 className="font-display text-xl sm:text-2xl font-semibold mb-5">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
