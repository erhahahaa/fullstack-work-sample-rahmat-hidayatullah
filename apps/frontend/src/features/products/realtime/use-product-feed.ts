import { useCallback, useEffect, useRef } from "react";

import { createStockFeed, type StockFeed } from "@/features/products/realtime/feed";
import type { StockUpdate } from "@/features/products/types";

export function useProductFeed(options: {
  ids: readonly string[];
  ratePerSecond: number;
  enabled: boolean;
  onBatch: (updates: StockUpdate[]) => void;
}): { emitOnce: () => void } {
  const { ids, ratePerSecond, enabled, onBatch } = options;
  const onBatchRef = useRef(onBatch);
  const feedRef = useRef<StockFeed | null>(null);

  useEffect(() => {
    onBatchRef.current = onBatch;
  }, [onBatch]);

  useEffect(() => {
    const feed = createStockFeed({
      ids,
      ratePerSecond,
      onBatch: (updates) => {
        onBatchRef.current(updates);
      },
    });

    feedRef.current = feed;

    if (enabled) {
      feed.start();
    }

    return () => {
      feed.stop();

      if (feedRef.current === feed) {
        feedRef.current = null;
      }
    };
  }, [ids, ratePerSecond, enabled]);

  const emitOnce = useCallback(() => {
    feedRef.current?.emit();
  }, []);

  return { emitOnce };
}
