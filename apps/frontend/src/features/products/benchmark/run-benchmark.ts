export interface BenchmarkResult {
  iterations: number;
  samples: number[];
  p50: number;
  p95: number;
  mean: number;
  totalMs: number;
}

function summarizeSamples(samples: readonly number[]): {
  p50: number;
  p95: number;
  mean: number;
} {
  if (samples.length === 0) {
    return { p50: 0, p95: 0, mean: 0 };
  }

  const sorted = samples.toSorted((left, right) => left - right);
  const percentile = (quantile: number): number => {
    const index = Math.min(sorted.length - 1, Math.floor(quantile * sorted.length));
    return sorted[index] ?? 0;
  };
  const total = samples.reduce((sum, value) => sum + value, 0);

  return {
    p50: percentile(0.5),
    p95: percentile(0.95),
    mean: total / samples.length,
  };
}

function waitForNextPaint(): Promise<void> {
  if (typeof requestAnimationFrame !== "function") {
    return new Promise((resolve) => {
      setTimeout(resolve, 16);
    });
  }

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

export async function runBenchmark(options: {
  iterations: number;
  mutate: (index: number) => void;
  onProgress?: (done: number, total: number) => void;
  onSample?: (durationMs: number) => void;
  waitForPaint?: () => Promise<void>;
}): Promise<BenchmarkResult> {
  const total = Number.isFinite(options.iterations)
    ? Math.max(0, Math.trunc(options.iterations))
    : 0;
  const waitForPaint = options.waitForPaint ?? waitForNextPaint;
  const samples: number[] = [];
  const startedAt = performance.now();

  for (let index = 0; index < total; index += 1) {
    const frameStart = performance.now();
    options.mutate(index);
    await waitForPaint();
    const durationMs = performance.now() - frameStart;

    samples.push(durationMs);
    options.onSample?.(durationMs);
    options.onProgress?.(index + 1, total);
  }

  const summary = summarizeSamples(samples);

  return {
    iterations: total,
    samples,
    p50: summary.p50,
    p95: summary.p95,
    mean: summary.mean,
    totalMs: performance.now() - startedAt,
  };
}
