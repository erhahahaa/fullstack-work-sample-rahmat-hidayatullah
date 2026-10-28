import { Button } from "@fullstack-work-sample-rahmat-hidayatullah/ui/components/button";
import { Label } from "@fullstack-work-sample-rahmat-hidayatullah/ui/components/label";
import { Separator } from "@fullstack-work-sample-rahmat-hidayatullah/ui/components/separator";
import { Slider } from "@fullstack-work-sample-rahmat-hidayatullah/ui/components/slider";
import { Switch } from "@fullstack-work-sample-rahmat-hidayatullah/ui/components/switch";
import { cn } from "@fullstack-work-sample-rahmat-hidayatullah/ui/lib/utils";

import { formatNumber } from "@/features/products/lib/format";

export const BENCHMARK_IDLE_LABEL = "Run benchmark";

const ROW_COUNT_OPTIONS = [500, 5000, 20000] as const;

function firstSliderValue(value: number | readonly number[]): number | undefined {
  return typeof value === "number" ? value : value[0];
}

interface TableToolbarProps {
  rowCount: number;
  onRowCountChange: (rowCount: number) => void;
  rate: number;
  onRateChange: (rate: number) => void;
  running: boolean;
  onToggleRunning: (running: boolean) => void;
  onEmitOnce: () => void;
  onRunBenchmark: () => void;
  onResetMetrics: () => void;
  benchmarkLabel: string;
}

export function TableToolbar({
  rowCount,
  onRowCountChange,
  rate,
  onRateChange,
  running,
  onToggleRunning,
  onEmitOnce,
  onRunBenchmark,
  onResetMetrics,
  benchmarkLabel,
}: TableToolbarProps) {
  const benchmarkRunning = benchmarkLabel !== BENCHMARK_IDLE_LABEL;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium tracking-wide uppercase text-muted-foreground">
          Rows
        </span>
        <div className="flex items-center border border-border">
          {ROW_COUNT_OPTIONS.map((option) => (
            <Button
              key={option}
              size="xs"
              variant={option === rowCount ? "secondary" : "ghost"}
              className={cn(
                "rounded-none border-r border-border px-2 font-mono last:border-r-0",
                option === rowCount && "font-medium",
              )}
              onClick={() => onRowCountChange(option)}
            >
              {formatNumber(option)}
            </Button>
          ))}
        </div>
      </div>

      <Separator orientation="vertical" className="hidden h-5 sm:block" />

      <div className="flex items-center gap-2">
        <Switch
          id="realtime-toggle"
          size="sm"
          checked={running}
          onCheckedChange={onToggleRunning}
        />
        <Label htmlFor="realtime-toggle" className="text-xs">
          Realtime
        </Label>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium tracking-wide uppercase text-muted-foreground">
          Rate
        </span>
        <Slider
          aria-label="Updates per second"
          className="w-24"
          min={1}
          max={50}
          step={1}
          value={[rate]}
          onValueChange={(value) => {
            const next = firstSliderValue(value);

            if (next !== undefined) {
              onRateChange(next);
            }
          }}
        />
        <span className="w-12 font-mono text-[11px] tabular-nums text-muted-foreground">
          {rate}/s
        </span>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button size="xs" variant="outline" onClick={onEmitOnce} disabled={benchmarkRunning}>
          Apply one update
        </Button>
        <Button
          size="xs"
          variant="secondary"
          onClick={onRunBenchmark}
          disabled={benchmarkRunning}
          className="min-w-32 font-mono"
        >
          {benchmarkLabel}
        </Button>
        <Button size="xs" variant="ghost" onClick={onResetMetrics} disabled={benchmarkRunning}>
          Reset metrics
        </Button>
      </div>
    </div>
  );
}
