import { useEffect } from "react";

import { productMetrics } from "@/features/products/metrics/metrics-store";

/**
 * Counts committed renders, not render calls. Reporting from an effect keeps the
 * measurement out of the render phase, so it cannot change what is rendered and
 * cannot be double counted by a discarded render.
 */
export function useRenderCount(kind: "row" | "cell"): void {
  useEffect(() => {
    if (kind === "row") {
      productMetrics.recordRowRender();
    } else {
      productMetrics.recordCellRender();
    }
  });
}
