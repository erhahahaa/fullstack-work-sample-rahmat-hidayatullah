import { cn } from "@fullstack-work-sample-rahmat-hidayatullah/ui/lib/utils";
import { useCallback, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Grid } from "react-window";

import { ProductCell } from "@/features/products/components/product-cell";
import {
  GRID_WIDTH,
  PRODUCT_COLUMNS,
  ROW_HEIGHT,
} from "@/features/products/components/table-columns";
import { TableHeader } from "@/features/products/components/table-header";
import { productMetrics } from "@/features/products/metrics/metrics-store";
import type { ColumnDefinition } from "@/features/products/types";

interface GridCellProps {
  ids: readonly string[];
  columns: readonly ColumnDefinition[];
}

interface GridCellComponentProps extends GridCellProps {
  ariaAttributes: { "aria-colindex": number; role: "gridcell" };
  columnIndex: number;
  rowIndex: number;
  style: CSSProperties;
}

function GridCell({
  ariaAttributes,
  columnIndex,
  rowIndex,
  style,
  ids,
  columns,
}: GridCellComponentProps) {
  const column = columns[columnIndex];
  const productId = ids[rowIndex];

  if (column === undefined || productId === undefined) {
    return <div {...ariaAttributes} style={style} />;
  }

  return (
    <ProductCell
      productId={productId}
      column={column}
      rowIndex={rowIndex}
      style={style}
      align={column.align}
      ariaAttributes={ariaAttributes}
    />
  );
}

interface ProductGridProps {
  ids: readonly string[];
  className?: string;
}

export function ProductGrid({ ids, className }: ProductGridProps) {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);

  const cellProps = useMemo<GridCellProps>(() => ({ ids, columns: PRODUCT_COLUMNS }), [ids]);

  const columnWidth = useCallback(
    (index: number, data: GridCellProps) => data.columns[index]?.width ?? 0,
    [],
  );

  const rowKey = useCallback(
    ({ data, rowIndex }: { data: GridCellProps; rowIndex: number }) =>
      data.ids[rowIndex] ?? rowIndex,
    [],
  );

  const handleCellsRendered = useCallback(
    (
      _visibleCells: {
        columnStartIndex: number;
        columnStopIndex: number;
        rowStartIndex: number;
        rowStopIndex: number;
      },
      allCells: {
        columnStartIndex: number;
        columnStopIndex: number;
        rowStartIndex: number;
        rowStopIndex: number;
      },
    ) => {
      const columnCount = Math.max(0, allCells.columnStopIndex - allCells.columnStartIndex + 1);
      const rowCount = Math.max(0, allCells.rowStopIndex - allCells.rowStartIndex + 1);
      productMetrics.setMountedCells(columnCount * rowCount);
    },
    [],
  );

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border bg-background",
        className,
      )}
    >
      <div ref={setScrollElement} className="min-h-0 flex-1 overflow-auto">
        <div className="flex flex-col" style={{ width: `max(100%, ${GRID_WIDTH}px)` }}>
          <TableHeader />
          <Grid<GridCellProps>
            aria-label="Product table"
            cellComponent={GridCell}
            cellProps={cellProps}
            columnCount={PRODUCT_COLUMNS.length}
            columnWidth={columnWidth}
            rowCount={ids.length}
            rowHeight={ROW_HEIGHT}
            rowKey={rowKey}
            scrollElement={scrollElement}
            defaultHeight={600}
            defaultWidth={GRID_WIDTH}
            overscanCount={4}
            onCellsRendered={handleCellsRendered}
            style={{ height: ids.length * ROW_HEIGHT, width: "100%", overflow: "hidden" }}
          />
        </div>
      </div>
    </div>
  );
}
