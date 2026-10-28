import { Badge } from "@fullstack-work-sample-rahmat-hidayatullah/ui/components/badge";
import { cn } from "@fullstack-work-sample-rahmat-hidayatullah/ui/lib/utils";
import { memo } from "react";
import type { CSSProperties } from "react";

import { useRenderCount } from "@/features/products/hooks/use-render-count";
import { formatCurrency, formatDateTime, formatNumber } from "@/features/products/lib/format";
import { statusLabel } from "@/features/products/lib/stock-status";
import { useProductStore } from "@/features/products/store/product-store";
import type { CellAlign, ColumnDefinition, StockStatus } from "@/features/products/types";

const EMPTY_VALUE = "-";

type StatusVariant = "secondary" | "outline" | "destructive";

const STATUS_VARIANTS: Record<StockStatus, StatusVariant> = {
  in_stock: "secondary",
  low_stock: "outline",
  out_of_stock: "destructive",
};

const STATUS_CLASSES: Record<StockStatus, string> = {
  in_stock: "",
  low_stock: "border-amber-500/40 text-amber-600 dark:border-amber-400/40 dark:text-amber-400",
  out_of_stock: "",
};

function isStockStatus(value: string | number | undefined): value is StockStatus {
  return value === "in_stock" || value === "low_stock" || value === "out_of_stock";
}

export interface ProductFieldProps {
  columnKey: ColumnDefinition["key"];
  value: string | number | undefined;
}

/**
 * Shared field renderer so the virtualized cell and the naive row format values
 * exactly the same way.
 */
export function ProductField({ columnKey, value }: ProductFieldProps) {
  switch (columnKey) {
    case "price":
      return (
        <span className="font-mono tabular-nums">
          {typeof value === "number" ? formatCurrency(value) : EMPTY_VALUE}
        </span>
      );
    case "stock":
      return (
        <span className="font-mono tabular-nums">
          {typeof value === "number" ? formatNumber(value) : EMPTY_VALUE}
        </span>
      );
    case "updatedAt":
      return (
        <span className="font-mono tabular-nums">
          {typeof value === "number" ? formatDateTime(value) : EMPTY_VALUE}
        </span>
      );
    case "status":
      if (!isStockStatus(value)) {
        return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
      }

      return (
        <Badge variant={STATUS_VARIANTS[value]} className={STATUS_CLASSES[value]}>
          {statusLabel(value)}
        </Badge>
      );
    default:
      return (
        <span className="truncate" title={typeof value === "string" ? value : undefined}>
          {typeof value === "string" ? value : EMPTY_VALUE}
        </span>
      );
  }
}

export interface ProductCellProps {
  productId: string;
  column: ColumnDefinition;
  rowIndex: number;
  style: CSSProperties;
  align: CellAlign;
  ariaAttributes?: { "aria-colindex": number; role: "gridcell" };
}

/**
 * Subscribes to a single product field. A stock change updates the stock and
 * status cells for that product only; every other mounted cell is untouched.
 */
export const ProductCell = memo(function ProductCell({
  productId,
  column,
  rowIndex,
  style,
  align,
  ariaAttributes,
}: ProductCellProps) {
  useRenderCount("cell");

  const value = useProductStore((state) => state.byId[productId]?.[column.key]);

  return (
    <div
      {...ariaAttributes}
      style={style}
      className={cn(
        "flex items-center overflow-hidden border-b border-border/60 px-3 text-xs whitespace-nowrap",
        rowIndex % 2 === 1 ? "bg-muted/20" : "bg-background",
        align === "right" ? "justify-end text-right" : "justify-start text-left",
      )}
    >
      <ProductField columnKey={column.key} value={value} />
    </div>
  );
});
