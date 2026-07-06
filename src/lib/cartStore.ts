"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Product } from "@/types";

interface CartLine {
  product: Product;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  add: (product: Product, qty?: number) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, qty: number) => void;
  clear: () => void;
  total: () => number;
  count: () => number;
}

// Корзина хранится в localStorage браузера пользователя (это обычный сайт, а не Claude-артефакт,
// так что localStorage здесь работает нормально и переживает обновление страницы).
export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      add: (product, qty = 1) =>
        set((state) => {
          const existing = state.lines.find((l) => l.product.id === product.id);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.product.id === product.id ? { ...l, quantity: l.quantity + qty } : l
              ),
            };
          }
          return { lines: [...state.lines, { product, quantity: qty }] };
        }),
      remove: (productId) =>
        set((state) => ({ lines: state.lines.filter((l) => l.product.id !== productId) })),
      setQuantity: (productId, qty) =>
        set((state) => ({
          lines: state.lines.map((l) => (l.product.id === productId ? { ...l, quantity: Math.max(1, qty) } : l)),
        })),
      clear: () => set({ lines: [] }),
      total: () => get().lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0),
      count: () => get().lines.reduce((sum, l) => sum + l.quantity, 0),
    }),
    { name: "velox-trade-cart" }
  )
);
