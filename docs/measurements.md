# Measurement log

All numbers below come from this machine, not from a synthetic benchmark harness. They are a
comparison between two implementations of the same screen, measured the same way.

## Environment

| Item              | Value                                                        |
| ----------------- | ------------------------------------------------------------ |
| CPU               | AMD Ryzen (8 cores visible to the container)                 |
| Browser           | Headless Chromium 156.0.8078.4, Playwright 1.64.1            |
| Viewport          | 1440 x 900                                                   |
| Dataset           | 5,000 products, seed 42, 7 columns                           |
| Production build  | `bun run build`, served by `vp preview`                      |
| Development build | `vp dev`, React 19.3.1 with the default development Profiler |

## Method

1. Open the route with `?rows=5000` and wait for the feed to settle.
2. Press **Reset metrics** so the counters start at zero.
3. Press **Apply one update** once. Read row renders, cell renders, commit duration, and update
   latency from the performance panel.
4. Press **Apply one update** twelve times with 250 ms between presses to collect an update p95.
5. Press **Run benchmark**. The naive route runs 20 iterations, the optimized route runs 100.
   Each iteration mutates one product and waits for two animation frames. The panel reports the
   p50 and p95 of the React commit duration across those iterations.
6. Count DOM nodes and grid cells with `document.querySelectorAll`.

The benchmark iteration count differs because the naive route takes about a third of a second per
update. Twenty samples is enough to see the distribution and does not make the reviewer wait.

## Results

### Structure

| Metric                | Naive  | Optimized | Ratio |
| --------------------- | ------ | --------- | ----- |
| DOM nodes after mount | 85,116 | 429       | 198x  |
| Cells in the DOM      | 35,000 | 147       | 238x  |
| Rows in the DOM       | 5,001  | 22        | 227x  |
| Mounted cell counter  | 35,000 | 147       | 238x  |

These counts come from the production build. The development build adds the router devtools, so it
reports 85,668 and 981 respectively.

### Work per single stock update

| Metric                    | Naive                | Optimized            |
| ------------------------- | -------------------- | -------------------- |
| Row components committed  | 5,000                | 0                    |
| Cell components committed | 0                    | 2                    |
| Product objects replaced  | 5,000 in a new array | 1 in a new map entry |

The optimized route commits two cells because a stock change touches both the stock cell and the
status cell for that product. Every other mounted cell keeps its previous value and does not
re-render.

### Timing

| Metric                                                             | Naive             | Optimized       |
| ------------------------------------------------------------------ | ----------------- | --------------- |
| Commit duration, single update (development Profiler)              | 331.9 ms          | 0.2 ms          |
| Commit p50, benchmark (development Profiler)                       | 330.4 ms          | 0.2 ms          |
| Commit p95, benchmark (development Profiler)                       | 342.8 ms          | 0.4 ms          |
| Update to second animation frame, p95 over 12 updates (production) | 124.7 to 141.4 ms | 11.1 to 30.8 ms |

Two caveats worth stating rather than hiding.

React only calls `Profiler.onRender` in development builds. The commit timings therefore come from
`vp dev`. The production numbers in the last row come from `vp preview` and measure from the
mutation to the second animation frame, which is frame aligned and therefore noisy. Both columns are
compared within the same build, never across builds.

The second caveat is that a development build is slower than a production build because of
instrumentation, unminified code, and extra checks. That inflates both sides, which is why the ratio
matters more than the absolute number.

## Reproducing

```bash
bun install
bun run dev
# open http://localhost:3001/optimized?rows=5000
# press Reset metrics, then Apply one update, then Run benchmark
```

The same controls exist on `/naive`. Change `rows` in the URL to try 500 or 20,000.
