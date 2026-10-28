import { useSyncExternalStore } from "react";

import { productMetrics } from "@/features/products/metrics/metrics-store";

export function useProductMetrics() {
  return useSyncExternalStore(
    productMetrics.subscribe,
    productMetrics.getSnapshot,
    productMetrics.getSnapshot,
  );
}
