import { createFileRoute } from "@tanstack/react-router";
import { Profiler, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { NaiveTable } from "@/features/products/components/naive-table";
import { PerfPanel } from "@/features/products/components/perf-panel";
import { PRODUCT_COLUMNS } from "@/features/products/components/table-columns";
import { BENCHMARK_IDLE_LABEL, TableToolbar } from "@/features/products/components/table-toolbar";
import { runBenchmark } from "@/features/products/benchmark/run-benchmark";
import { generateProducts } from "@/features/products/data/generate-products";
import { formatDuration, formatMilliseconds } from "@/features/products/lib/format";
import { statusForStock } from "@/features/products/lib/stock-status";
import { productMetrics } from "@/features/products/metrics/metrics-store";
import { useProductFeed } from "@/features/products/realtime/use-product-feed";
import { useProductStore } from "@/features/products/store/product-store";
import type { Product, StockUpdate } from "@/features/products/types";

const DEFAULT_ROWS = 5000;
const MIN_ROWS = 100;
const MAX_ROWS = 50000;
const BENCHMARK_ITERATIONS = 20;

interface NaiveSearch {
  rows: number;
}

function parseRows(value: unknown): number {
  const candidate =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isInteger(candidate)) {
    return DEFAULT_ROWS;
  }

  return Math.min(MAX_ROWS, Math.max(MIN_ROWS, candidate));
}

function recordUpdateAfterCommit(startedAt: number) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      productMetrics.recordUpdate(performance.now() - startedAt);
    });
  });
}

export const Route = createFileRoute("/naive")({
  validateSearch: (search: Record<string, unknown>): NaiveSearch => ({
    rows: parseRows(search.rows),
  }),
  component: NaiveRoute,
});

function NaiveRoute() {
  const { rows } = Route.useSearch();

  // Remounting on row count keeps dataset and state in sync without an effect
  // that calls setState during commit.
  return <NaiveDashboard key={rows} rows={rows} />;
}

function NaiveDashboard({ rows }: { rows: number }) {
  const navigate = Route.useNavigate();

  const [dataset] = useState<Product[]>(() => generateProducts(rows));
  const [products, setProducts] = useState<Product[]>(dataset);
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState(5);
  const [benchmarkLabel, setBenchmarkLabel] = useState(BENCHMARK_IDLE_LABEL);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);

  const ids = useProductStore((state) => state.allIds);

  useEffect(() => {
    useProductStore.getState().reset(dataset);
    productMetrics.reset();
    productMetrics.setMountedCells(dataset.length * PRODUCT_COLUMNS.length);
  }, [dataset]);

  const applyUpdates = useCallback((updates: readonly StockUpdate[]) => {
    if (updates.length === 0) {
      return;
    }

    const startedAt = performance.now();
    productMetrics.recordMutation();

    const nextStocks = new Map(updates.map((update) => [update.id, update.stock]));

    setProducts((previous) =>
      previous.map((product) => {
        const nextStock = nextStocks.get(product.id);

        if (nextStock === undefined) {
          return product;
        }

        const stock = Math.max(0, Math.trunc(nextStock));

        if (stock === product.stock) {
          return product;
        }

        return {
          ...product,
          stock,
          status: statusForStock(stock),
          updatedAt: Date.now(),
        };
      }),
    );

    recordUpdateAfterCommit(startedAt);
  }, []);

  useProductFeed({
    ids,
    ratePerSecond: rate,
    enabled: running,
    onBatch: applyUpdates,
  });

  const handleEmitOnce = useCallback(() => {
    const target = products[0];

    if (target === undefined) {
      return;
    }

    applyUpdates([{ id: target.id, stock: target.stock <= 1 ? 25 : target.stock - 1 }]);
  }, [applyUpdates, products]);

  const handleRestock = useCallback((id: string) => {
    const startedAt = performance.now();
    productMetrics.recordMutation();

    setProducts((previous) =>
      previous.map((product) => {
        if (product.id !== id) {
          return product;
        }

        const stock = product.stock + 5;

        return {
          ...product,
          stock,
          status: statusForStock(stock),
          updatedAt: Date.now(),
        };
      }),
    );

    recordUpdateAfterCommit(startedAt);
  }, []);

  const resetMetrics = useCallback(() => {
    productMetrics.reset();
    productMetrics.setMountedCells(dataset.length * PRODUCT_COLUMNS.length);
    setBenchmarkLabel(BENCHMARK_IDLE_LABEL);
  }, [dataset]);

  const handleRunBenchmark = useCallback(() => {
    if (benchmarkRunning) {
      return;
    }

    setRunning(false);
    setBenchmarkRunning(true);
    resetMetrics();
    setBenchmarkLabel(`Benchmark 0/${BENCHMARK_ITERATIONS}`);

    void runBenchmark({
      iterations: BENCHMARK_ITERATIONS,
      mutate: (index) => {
        setProducts((previous) => {
          if (previous.length === 0) {
            return previous;
          }

          const target = previous[index % previous.length];

          if (target === undefined) {
            return previous;
          }

          const stock = target.stock <= 1 ? 40 : target.stock - 1;

          return previous.map((product) =>
            product.id === target.id
              ? { ...product, stock, status: statusForStock(stock), updatedAt: Date.now() }
              : product,
          );
        });

        productMetrics.recordMutation();
      },
      onProgress: (done, total) => {
        setBenchmarkLabel(`Benchmark ${done}/${total}`);
      },
    })
      .then((result) => {
        toast.success("Benchmark complete", {
          description: `p50 ${formatMilliseconds(result.p50)}, p95 ${formatMilliseconds(
            result.p95,
          )}, total ${formatDuration(result.totalMs)}`,
        });
      })
      .catch(() => {
        toast.error("Benchmark failed");
      })
      .finally(() => {
        setBenchmarkRunning(false);
        setBenchmarkLabel(BENCHMARK_IDLE_LABEL);
      });
  }, [benchmarkRunning, resetMetrics]);

  const handleProfilerRender = useCallback(
    (_id: string, _phase: "mount" | "update" | "nested-update", actualDuration: number) => {
      productMetrics.recordCommit(actualDuration);
    },
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3">
      <TableToolbar
        rowCount={rows}
        onRowCountChange={(nextRows) => {
          void navigate({ search: { rows: nextRows } });
        }}
        rate={rate}
        onRateChange={setRate}
        running={running}
        onToggleRunning={setRunning}
        onEmitOnce={handleEmitOnce}
        onRunBenchmark={handleRunBenchmark}
        onResetMetrics={resetMetrics}
        benchmarkLabel={benchmarkLabel}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <Profiler id="naive-table" onRender={handleProfilerRender}>
          <NaiveTable products={products} onRestock={handleRestock} />
        </Profiler>
        <PerfPanel />
      </div>
    </div>
  );
}
