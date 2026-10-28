import { create } from "zustand";

import { statusForStock } from "@/features/products/lib/stock-status";
import type { Product, StockUpdate } from "@/features/products/types";

export interface ProductStoreState {
  byId: Record<string, Product>;
  allIds: string[];
  updateStock: (id: string, stock: number) => void;
  updateMany: (updates: readonly StockUpdate[]) => void;
  reset: (products: readonly Product[]) => void;
}

function applyStock(product: Product, stock: number): Product {
  const nextStock = Math.max(0, Math.trunc(stock));

  if (product.stock === nextStock) {
    return product;
  }

  return {
    ...product,
    stock: nextStock,
    status: statusForStock(nextStock),
    updatedAt: Date.now(),
  };
}

export const useProductStore = create<ProductStoreState>()((set) => ({
  byId: {},
  allIds: [],
  updateStock: (id, stock) => {
    set((state) => {
      const current = state.byId[id];

      if (current === undefined) {
        return state;
      }

      const next = applyStock(current, stock);

      if (next === current) {
        return state;
      }

      return { byId: { ...state.byId, [id]: next } };
    });
  },
  updateMany: (updates) => {
    set((state) => {
      let changed = false;
      const byId = { ...state.byId };

      for (const update of updates) {
        const current = byId[update.id];

        if (current === undefined) {
          continue;
        }

        const next = applyStock(current, update.stock);

        if (next === current) {
          continue;
        }

        byId[update.id] = next;
        changed = true;
      }

      if (!changed) {
        return state;
      }

      return { byId };
    });
  },
  reset: (products) => {
    const byId: Record<string, Product> = {};
    const allIds: string[] = [];

    for (const product of products) {
      byId[product.id] = product;
      allIds.push(product.id);
    }

    set({ byId, allIds });
  },
}));

export function selectProduct(id: string) {
  return (state: ProductStoreState) => state.byId[id];
}

export function selectProductStock(id: string) {
  return (state: ProductStoreState) => state.byId[id]?.stock ?? 0;
}

export function selectProductCount(state: ProductStoreState) {
  return state.allIds.length;
}
