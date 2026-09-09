"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { useFavorites } from "@/lib/favoritesStore";
import { getUserFavoriteIds } from "@/lib/favorites";

export function FavoritesSync() {
  const { user } = useAuth();
  const setIds = useFavorites((s) => s.setIds);

  useEffect(() => {
    if (!user) {
      setIds([]);
      return;
    }
    getUserFavoriteIds(user.uid)
      .then(setIds)
      .catch(() => setIds([]));
  }, [user, setIds]);

  return null;
}
