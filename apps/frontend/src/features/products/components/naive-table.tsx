// ARIA grid roles are intentional. The baseline mirrors the optimized grid markup.
/* eslint-disable jsx-a11y/prefer-tag-over-role */
import { Badge } from "@fullstack-work-sample-rahmat-hidayatullah/ui/components/badge";

import { NaiveRow } from "@/features/products/components/naive-row";
import { GRID_WIDTH } from "@/features/products/components/table-columns";
import { TableHeader } from "@/features/products/components/table-header";
import { formatNumber } from "@/features/products/lib/format";
import type { Product } from "@/features/products/types";

interface NaiveTableProps {
  products: readonly Product[];
  onRestock: (id: string) => void;
}

export function NaiveTable({ products, onRestock }: NaiveTableProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-background">
      <div className="flex shrink-0 items-start gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
        <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
          Baseline
        </Badge>
        <p className="text-muted-foreground">
          This route intentionally reproduces the problem. Every stock change replaces the full
          array and re-renders all {formatNumber(products.length)} rows. The optimized route is the
          deliverable.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div role="table" aria-label="Naive product table" style={{ width: GRID_WIDTH }}>
          <TableHeader />
          <div role="rowgroup">
            {products.map((product, rowIndex) => (
              <NaiveRow
                key={product.id}
                product={product}
                rowIndex={rowIndex}
                onRestock={onRestock}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
