import type { StockStatus } from "@/features/products/types";

export const LOW_STOCK_THRESHOLD = 10;

export function statusForStock(stock: number): StockStatus {
  if (stock <= 0) {
    return "out_of_stock";
  }

  if (stock < LOW_STOCK_THRESHOLD) {
    return "low_stock";
  }

  return "in_stock";
}

export function statusLabel(status: StockStatus): string {
  switch (status) {
    case "in_stock":
      return "In stock";
    case "low_stock":
      return "Low stock";
    case "out_of_stock":
      return "Out of stock";
  }
}
