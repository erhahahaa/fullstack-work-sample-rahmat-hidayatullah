import { createFileRoute } from "@tanstack/react-router";
import { Profiler, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { PerfPanel } from "@/features/products/components/perf-panel";
import { ProductGrid } from "@/features/products/components/product-grid";
import { BENCHMARK_IDLE_LABEL, TableToolbar } from "@/features/products/components/table-toolbar";
import { runBenchmark } from "@/features/products/benchmark/run-benchmark";
import { generateProducts } from "@/features/products/data/generate-products";
import { formatDuration, formatMilliseconds } from "@/features/products/lib/format";
import { productMetrics } from "@/features/products/metrics/metrics-store";
import { useProductFeed } from "@/features/products/realtime/use-product-feed";
import { useProductStore } from "@/features/products/store/product-store";
import type { StockUpdate } from "@/features/products/types";

const DEFAULT_ROWS = 5000;
const MIN_ROWS = 100;
const MAX_ROWS = 50000;
const BENCHMARK_ITERATIONS = 100;

interface OptimizedSearch {
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

export const Route = createFileRoute("/optimized")({
  validateSearch: (search: Record<string, unknown>): OptimizedSearch => ({
    rows: parseRows(search.rows),
  }),
  component: OptimizedRoute,
});

function OptimizedRoute() {
  const { rows } = Route.useSearch();

  // Remounting on row count keeps dataset and state in sync without an effect
  // that calls setState during commit.
  return <OptimizedDashboard key={rows} rows={rows} />;
}

function OptimizedDashboard({ rows }: { rows: number }) {
  const navigate = Route.useNavigate();

  const [dataset] = useState(() => generateProducts(rows));
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState(5);
  const [benchmarkLabel, setBenchmarkLabel] = useState(BENCHMARK_IDLE_LABEL);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);

  const ids = useProductStore((state) => state.allIds);

  useEffect(() => {
    useProductStore.getState().reset(dataset);
    productMetrics.reset();
  }, [dataset]);

  const applyUpdates = useCallback((updates: readonly StockUpdate[]) => {
    if (updates.length === 0) {
      return;
    }

    const startedAt = performance.now();
    productMetrics.recordMutation();
    useProductStore.getState().updateMany(updates);
    recordUpdateAfterCommit(startedAt);
  }, []);

  useProductFeed({
    ids,
    ratePerSecond: rate,
    enabled: running,
    onBatch: applyUpdates,
  });

  const handleEmitOnce = useCallback(() => {
    const state = useProductStore.getState();
    const id = state.allIds[0];

    if (id === undefined) {
      return;
    }

    const product = state.byId[id];

    if (product === undefined) {
      return;
    }

    applyUpdates([{ id, stock: product.stock <= 1 ? 25 : product.stock - 1 }]);
  }, [applyUpdates]);

  const resetMetrics = useCallback(() => {
    const mountedCells = productMetrics.getSnapshot().mountedCells;
    productMetrics.reset();
    productMetrics.setMountedCells(mountedCells);
    setBenchmarkLabel(BENCHMARK_IDLE_LABEL);
  }, []);

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
        const state = useProductStore.getState();
        const id = state.allIds[index % Math.max(1, state.allIds.length)];

        if (id === undefined) {
          return;
        }

        const product = state.byId[id];

        if (product === undefined) {
          return;
        }

        const stock = product.stock <= 1 ? 40 : product.stock - 1;
        state.updateStock(id, stock);
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
        <Profiler id="optimized-grid" onRender={handleProfilerRender}>
          <ProductGrid ids={ids} />
        </Profiler>
        <PerfPanel />
      </div>
    </div>
  );
}
