import { Badge } from "@fullstack-work-sample-rahmat-hidayatullah/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@fullstack-work-sample-rahmat-hidayatullah/ui/components/card";
import { Separator } from "@fullstack-work-sample-rahmat-hidayatullah/ui/components/separator";
import { cn } from "@fullstack-work-sample-rahmat-hidayatullah/ui/lib/utils";

import { formatMilliseconds, formatNumber } from "@/features/products/lib/format";
import { summarizeSamples } from "@/features/products/metrics/metrics-store";
import { useProductMetrics } from "@/features/products/metrics/use-product-metrics";

interface StatProps {
  label: string;
  value: string;
  className?: string;
}

function Stat({ label, value, className }: StatProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="truncate text-[10px] font-medium tracking-wide uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("font-mono text-sm tabular-nums", className)}>{value}</dd>
    </div>
  );
}

export function PerfPanel() {
  const metrics = useProductMetrics();
  const commitSummary = summarizeSamples(metrics.commitSamples);
  const updateSummary = summarizeSamples(metrics.updateSamples);

  return (
    <Card size="sm" className="w-full shrink-0 lg:w-[280px]">
      <CardHeader className="border-b pb-3">
        <CardTitle className="flex items-center justify-between gap-2">
          Performance
          <Badge variant="outline" className="font-mono text-[10px] tracking-wide uppercase">
            Live
          </Badge>
        </CardTitle>
        <CardDescription>Counters flush every 200 ms. Reset before each run.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
          <Stat label="Row renders" value={formatNumber(metrics.rowRenders)} />
          <Stat label="Cell renders" value={formatNumber(metrics.cellRenders)} />
          <Stat label="Mutations" value={formatNumber(metrics.mutations)} />
          <Stat label="Mounted cells" value={formatNumber(metrics.mountedCells)} />
          <Stat label="Last commit" value={formatMilliseconds(metrics.lastCommitMs)} />
          <Stat label="Last update" value={formatMilliseconds(metrics.lastUpdateMs)} />
        </dl>

        <Separator />

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-medium tracking-wide uppercase text-muted-foreground">
            Commit samples
          </span>
          {commitSummary.p50 === null ? (
            <span className="text-[10px] leading-relaxed text-muted-foreground">
              React only reports commit timings in development builds. Run the dev server to see
              them.
            </span>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="p50" value={formatMilliseconds(commitSummary.p50)} />
              <Stat label="p95" value={formatMilliseconds(commitSummary.p95)} />
              <Stat label="Mean" value={formatMilliseconds(commitSummary.mean)} />
            </div>
          )}
          <span className="text-[10px] text-muted-foreground">
            Update p95:{" "}
            <span className="font-mono tabular-nums">{formatMilliseconds(updateSummary.p95)}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
