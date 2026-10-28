// ARIA grid roles are intentional. The header mirrors the react-window grid contract.
/* eslint-disable jsx-a11y/prefer-tag-over-role */
import { cn } from "@fullstack-work-sample-rahmat-hidayatullah/ui/lib/utils";

import { HEADER_HEIGHT, PRODUCT_COLUMNS } from "@/features/products/components/table-columns";
import type { ColumnDefinition } from "@/features/products/types";

interface TableHeaderProps {
  columns?: readonly ColumnDefinition[];
}

export function TableHeader({ columns = PRODUCT_COLUMNS }: TableHeaderProps) {
  return (
    <div
      role="row"
      style={{ height: HEADER_HEIGHT }}
      className="sticky top-0 z-10 flex shrink-0 items-stretch border-b border-border bg-muted/60 backdrop-blur-sm"
    >
      {columns.map((column) => (
        <div
          key={column.key}
          role="columnheader"
          style={{ width: column.width }}
          className={cn(
            "flex items-center border-r border-border/40 px-3 text-[10px] font-medium tracking-wide uppercase text-muted-foreground last:border-r-0",
            column.align === "right" ? "justify-end text-right" : "justify-start text-left",
          )}
        >
          {column.label}
        </div>
      ))}
    </div>
  );
}
