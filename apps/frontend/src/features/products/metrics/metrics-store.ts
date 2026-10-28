export interface MetricsSnapshot {
  rowRenders: number;
  cellRenders: number;
  mutations: number;
  mountedCells: number;
  lastCommitMs: number | null;
  lastUpdateMs: number | null;
  commitSamples: readonly number[];
  updateSamples: readonly number[];
}

interface MutableMetrics {
  rowRenders: number;
  cellRenders: number;
  mutations: number;
  mountedCells: number;
  lastCommitMs: number | null;
  lastUpdateMs: number | null;
  commitSamples: number[];
  updateSamples: number[];
}

const MAX_SAMPLES = 40;
const FLUSH_INTERVAL_MS = 200;

function initialState(): MutableMetrics {
  return {
    rowRenders: 0,
    cellRenders: 0,
    mutations: 0,
    mountedCells: 0,
    lastCommitMs: null,
    lastUpdateMs: null,
    commitSamples: [],
    updateSamples: [],
  };
}

function toSnapshot(state: MutableMetrics): MetricsSnapshot {
  return {
    rowRenders: state.rowRenders,
    cellRenders: state.cellRenders,
    mutations: state.mutations,
    mountedCells: state.mountedCells,
    lastCommitMs: state.lastCommitMs,
    lastUpdateMs: state.lastUpdateMs,
    commitSamples: [...state.commitSamples],
    updateSamples: [...state.updateSamples],
  };
}

let state = initialState();
let snapshot = toSnapshot(state);
const listeners = new Set<() => void>();
let flushHandle: ReturnType<typeof setTimeout> | null = null;

function pushSample(samples: number[], value: number) {
  samples.push(value);

  if (samples.length > MAX_SAMPLES) {
    samples.shift();
  }
}

function publish() {
  snapshot = toSnapshot(state);

  for (const listener of listeners) {
    listener();
  }
}

function scheduleFlush() {
  if (flushHandle !== null) {
    return;
  }

  flushHandle = setTimeout(() => {
    flushHandle = null;
    publish();
  }, FLUSH_INTERVAL_MS);
}

function reset() {
  if (flushHandle !== null) {
    clearTimeout(flushHandle);
    flushHandle = null;
  }

  state = initialState();
  publish();
}

export const productMetrics = {
  recordRowRender() {
    state.rowRenders += 1;
    scheduleFlush();
  },
  recordCellRender() {
    state.cellRenders += 1;
    scheduleFlush();
  },
  recordMutation() {
    state.mutations += 1;
    scheduleFlush();
  },
  recordCommit(durationMs: number) {
    state.lastCommitMs = durationMs;
    pushSample(state.commitSamples, durationMs);
    scheduleFlush();
  },
  recordUpdate(durationMs: number) {
    state.lastUpdateMs = durationMs;
    pushSample(state.updateSamples, durationMs);
    scheduleFlush();
  },
  setMountedCells(count: number) {
    if (state.mountedCells === count) {
      return;
    }

    state.mountedCells = count;
    scheduleFlush();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot() {
    return snapshot;
  },
  reset,
};

export function summarizeSamples(samples: readonly number[]) {
  if (samples.length === 0) {
    return { p50: null, p95: null, mean: null };
  }

  const sorted = samples.toSorted((left, right) => left - right);
  const pick = (quantile: number) => {
    const index = Math.min(sorted.length - 1, Math.floor(quantile * sorted.length));
    return sorted[index] ?? null;
  };
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return {
    p50: pick(0.5),
    p95: pick(0.95),
    mean: total / sorted.length,
  };
}
