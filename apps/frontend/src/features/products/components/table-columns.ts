import type { ColumnDefinition } from "@/features/products/types";

export const ROW_HEIGHT = 44;
export const HEADER_HEIGHT = 40;

/**
 * Column widths are fixed so the virtualized grid and the plain header row can
 * share the exact same layout without measuring the DOM.
 */
export const PRODUCT_COLUMNS: ColumnDefinition[] = [
  { key: "sku", label: "SKU", width: 120, align: "left" },
  { key: "name", label: "Product", width: 280, align: "left" },
  { key: "category", label: "Category", width: 160, align: "left" },
  { key: "price", label: "Price", width: 120, align: "right" },
  { key: "stock", label: "Stock", width: 100, align: "right" },
  { key: "status", label: "Status", width: 140, align: "left" },
  { key: "updatedAt", label: "Updated", width: 180, align: "right" },
];

export const GRID_WIDTH = PRODUCT_COLUMNS.reduce((total, column) => total + column.width, 0);

export const GRID_TEMPLATE = PRODUCT_COLUMNS.map((column) => `${column.width}px`).join(" ");
