import type { StockUpdate } from "@/features/products/types";

export interface StockFeed {
  start(): void;
  stop(): void;
  emit(): void;
  isRunning(): boolean;
}

type FrameHandle =
  | { type: "raf"; id: number }
  | { type: "timeout"; id: ReturnType<typeof setTimeout> };

const MAX_STOCK = 250;
const OUT_OF_STOCK_RATE = 0.08;
const INCREASE_RATE = 0.45;
const MAX_STOCK_STEP = 20;

function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function createStockFeed(options: {
  ids: readonly string[];
  ratePerSecond: number;
  onBatch: (updates: StockUpdate[]) => void;
  now?: () => number;
}): StockFeed {
  const { ids, ratePerSecond, onBatch, now } = options;
  const random = createRandom((now?.() ?? Date.now()) >>> 0);
  const latestStock = new Map<string, number>();
  const buffer = new Map<string, number>();

  let running = false;
  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  let frameHandle: FrameHandle | null = null;

  function cancelFrame(): void {
    if (frameHandle === null) {
      return;
    }

    if (frameHandle.type === "raf") {
      if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frameHandle.id);
      }
    } else {
      clearTimeout(frameHandle.id);
    }

    frameHandle = null;
  }

  function flush(): void {
    if (buffer.size === 0) {
      return;
    }

    const updates: StockUpdate[] = [];

    for (const [id, stock] of buffer) {
      updates.push({ id, stock });
    }

    buffer.clear();
    onBatch(updates);
  }

  function scheduleFlush(): void {
    if (frameHandle !== null) {
      return;
    }

    if (typeof requestAnimationFrame === "function") {
      frameHandle = {
        type: "raf",
        id: requestAnimationFrame(() => {
          frameHandle = null;
          flush();
        }),
      };
      return;
    }

    frameHandle = {
      type: "timeout",
      id: setTimeout(() => {
        frameHandle = null;
        flush();
      }, 0),
    };
  }

  function tick(force = false): void {
    if (!force && !running) {
      return;
    }

    // One update per tick keeps ratePerSecond honest. Batching happens in flush.
    const count = ids.length === 0 ? 0 : 1;

    for (let index = 0; index < count; index += 1) {
      const id = ids[Math.floor(random() * ids.length)];

      if (id === undefined) {
        continue;
      }

      const current = latestStock.get(id) ?? randomInt(random, 0, MAX_STOCK);
      let next: number;

      if (random() < OUT_OF_STOCK_RATE) {
        next = 0;
      } else if (current === 0 || random() < INCREASE_RATE) {
        next = Math.min(MAX_STOCK, current + randomInt(random, 1, MAX_STOCK_STEP));
      } else {
        next = Math.max(0, current - randomInt(random, 1, MAX_STOCK_STEP));
      }

      latestStock.set(id, next);
      buffer.set(id, next);
    }

    scheduleFlush();
  }

  function start(): void {
    if (running) {
      return;
    }

    running = true;

    if (ids.length === 0) {
      return;
    }

    const delay = 1000 / ratePerSecond;

    if (!Number.isFinite(delay) || delay <= 0) {
      return;
    }

    intervalHandle = setInterval(() => {
      tick();
    }, delay);
  }

  function stop(): void {
    running = false;

    if (intervalHandle !== null) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }

    cancelFrame();
    buffer.clear();
  }

  return {
    start,
    stop,
    emit() {
      tick(true);
      cancelFrame();
      flush();
    },
    isRunning() {
      return running;
    },
  };
}
