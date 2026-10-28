import { buttonVariants } from "@fullstack-work-sample-rahmat-hidayatullah/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@fullstack-work-sample-rahmat-hidayatullah/ui/components/card";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

const STACK = [
  { label: "Runtime", value: "React 19.3, Vite+, Bun monorepo" },
  { label: "Routing", value: "TanStack Router 1.170, file-based routes" },
  { label: "State", value: "Zustand 5, normalized products by id" },
  { label: "Virtualization", value: "react-window 2.5.1 Grid" },
  { label: "Styling", value: "Tailwind v4, base-lyra components" },
  { label: "Tests", value: "Vitest via Vite+, Testing Library" },
];

function HomeComponent() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-col gap-2">
          <span className="text-[10px] font-medium tracking-wide uppercase text-muted-foreground">
            Work sample
          </span>
          <h1 className="text-xl font-medium">5,000 row product table</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            A stock feed mutates a normalized product store many times per second. The baseline
            route reproduces the original problem, where every update re-renders the whole table.
            The optimized route keeps the same dataset and controls, but only the cells that own a
            changed field commit.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Naive baseline</CardTitle>
              <CardDescription>
                Plain rows, no memoization, no virtualization. Each stock update replaces the
                products array and re-renders every mounted row. The benchmark runs 20 iterations
                because this path is slow by design.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <span className="text-[10px] font-medium tracking-wide uppercase text-muted-foreground">
                Look for
              </span>
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                <li>Row render counter climbing on every batch</li>
                <li>Commit duration scaling with the dataset size</li>
                <li>Main thread stalls while the feed is enabled</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link
                to="/naive"
                search={{ rows: 5000 }}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Open baseline
              </Link>
            </CardFooter>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Optimized grid</CardTitle>
              <CardDescription>
                A react-window Grid with fixed column widths. Every cell subscribes to one field
                with a Zustand selector, so a stock update touches the stock and status cells for
                that product only. The benchmark runs 100 iterations.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <span className="text-[10px] font-medium tracking-wide uppercase text-muted-foreground">
                Look for
              </span>
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                <li>Cell render counter rising without row renders</li>
                <li>Small, stable commit samples at 20,000 rows</li>
                <li>Virtualization keeping the DOM bounded while scrolling</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link
                to="/optimized"
                search={{ rows: 5000 }}
                className={buttonVariants({ variant: "default", size: "sm" })}
              >
                Open optimized grid
              </Link>
            </CardFooter>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Stack</CardTitle>
              <CardDescription>Shared setup for both routes.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col">
                {STACK.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-baseline justify-between gap-4 border-b border-border/60 py-1.5 last:border-b-0"
                  >
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd className="text-right text-xs">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Measurement</CardTitle>
              <CardDescription>Both routes expose the same controls.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
              <p>
                Dataset size, realtime toggle, update rate, single update, benchmark, and metrics
                reset are identical on both routes. Update latency is sampled before the mutation
                and recorded after two animation frames.
              </p>
              <p>
                Commit duration comes from a React Profiler around the table. The side panel shows
                row and cell renders, mutation batches, mounted cells, last commit, last update, and
                p50/p95 commit samples.
              </p>
              <p>The README holds the written answers and tradeoffs.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
