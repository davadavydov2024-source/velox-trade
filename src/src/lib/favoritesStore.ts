"use client";

import { create } from "zustand";

interface FavoritesState {
  ids: Set<string>;
  setIds: (ids: string[]) => void;
  add: (id: string) => void;
  remove: (id: string) => void;
}

export const useFavorites = create<FavoritesState>((set) => ({
  ids: new Set(),
  setIds: (ids) => set({ ids: new Set(ids) }),
  add: (id) =>
    set((s) => {
      const next = new Set(s.ids);
      next.add(id);
      return { ids: next };
    }),
  remove: (id) =>
    set((s) => {
      const next = new Set(s.ids);
      next.delete(id);
      return { ids: next };
    }),
}));
