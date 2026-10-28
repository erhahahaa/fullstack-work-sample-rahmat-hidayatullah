// ARIA grid roles are intentional. The baseline mirrors the optimized grid markup.
/* eslint-disable jsx-a11y/prefer-tag-over-role */
import { cn } from "@fullstack-work-sample-rahmat-hidayatullah/ui/lib/utils";

import { ProductField } from "@/features/products/components/product-cell";
import {
  GRID_TEMPLATE,
  PRODUCT_COLUMNS,
  ROW_HEIGHT,
} from "@/features/products/components/table-columns";
import { useRenderCount } from "@/features/products/hooks/use-render-count";
import { formatNumber } from "@/features/products/lib/format";
import type { Product } from "@/features/products/types";

interface NaiveRowProps {
  product: Product;
  rowIndex: number;
  onRestock: (id: string) => void;
}

/**
 * Intentionally not memoized. The parent recreates the products array on every
 * update, so every row below re-renders.
 */
export function NaiveRow({ product, rowIndex, onRestock }: NaiveRowProps) {
  useRenderCount("row");

  return (
    <div
      role="row"
      className={cn(
        "group grid items-center border-b border-border/60 text-xs",
        rowIndex % 2 === 1 ? "bg-muted/20" : "bg-background",
      )}
      style={{ gridTemplateColumns: GRID_TEMPLATE, height: ROW_HEIGHT }}
    >
      {PRODUCT_COLUMNS.map((column) => (
        <div
          key={column.key}
          role="cell"
          className={cn(
            "flex min-w-0 items-center overflow-hidden px-3 whitespace-nowrap",
            column.align === "right" ? "justify-end text-right" : "justify-start text-left",
          )}
        >
          {column.key === "stock" ? (
            <div className="flex items-center gap-1.5">
              <span className="font-mono tabular-nums">{formatNumber(product.stock)}</span>
              <button
                type="button"
                onClick={() => onRestock(product.id)}
                className="border border-border px-1 font-mono text-[10px] leading-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground"
                title="Increase stock by 5"
              >
                +5
              </button>
            </div>
          ) : (
            <ProductField columnKey={column.key} value={product[column.key]} />
          )}
        </div>
      ))}
    </div>
  );
}
