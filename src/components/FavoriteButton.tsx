"use client";

import { Heart } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useFavorites } from "@/lib/favoritesStore";
import { addFavorite, removeFavorite } from "@/lib/favorites";
import { useToast } from "@/lib/toastContext";

export function FavoriteButton({ productId, className }: { productId: string; className?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const ids = useFavorites((s) => s.ids);
  const add = useFavorites((s) => s.add);
  const remove = useFavorites((s) => s.remove);
  const isFav = ids.has(productId);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast("warning", "Войди в аккаунт, чтобы добавлять товары в избранное");
      return;
    }
    if (isFav) {
      remove(productId);
      try {
        await removeFavorite(user.uid, productId);
      } catch {
        add(productId); // откат при сбое записи
      }
    } else {
      add(productId);
      try {
        await addFavorite(user.uid, productId);
      } catch {
        remove(productId);
      }
    }
  }

  return (
    <button
      onClick={handleClick}
      className={className ?? "p-1.5 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors"}
      aria-label={isFav ? "Убрать из избранного" : "Добавить в избранное"}
    >
      <Heart size={15} className={isFav ? "fill-red-500 text-red-500" : "text-white/70"} />
    </button>
  );
}
