# Performance

Open this when the spec has a speed/size/memory goal, when lists or queries grow with data, or when you suspect a regression. Without a goal or a symptom, don't optimize — just avoid the obvious anti-patterns below.

## Measure → find the bottleneck → fix → re-measure

1. **Measure** with a reproducible number on representative data and hardware (not just your fast machine): a benchmark, a profiler trace, Lighthouse, query plans, bundle analysis, startup timing.
2. **Find the one bottleneck** — the profile says where time goes; intuition usually doesn't.
3. **Fix that one thing.**
4. **Re-measure. Keep or revert.** A change that didn't measurably help is a revert: you'd pay to maintain it forever for nothing.
5. **Guard** — a benchmark or budget check in tests/CI so it doesn't silently regress.

Write the before/after numbers in the plan log.

## Targets (web; "good" thresholds)

| Metric | Good |
|---|---|
| LCP (largest contentful paint) | ≤ 2.5 s |
| INP (interaction to next paint) | ≤ 200 ms |
| CLS (layout shift) | ≤ 0.1 |
| API p95 for interactive calls | ≲ 300 ms (set your own in the spec) |

For desktop/mobile apps, set equivalents in the spec: cold start time, frame time (≤16 ms for 60 fps), memory ceiling, binary size.

## Common anti-patterns to avoid by default

- **N+1 queries** — a query per item in a loop; batch or join.
- **Unbounded fetches** — no `LIMIT`/pagination; loading everything into memory.
- **Work on the UI thread** — heavy parsing, image processing, sync I/O; move it to a worker/background task/native side.
- **Needless re-renders** — new object/array/function props every render, state too high in the tree, missing keys.
- **Oversized bundles** — importing a whole library for one function; no code splitting for rarely used screens; unoptimized images.
- **Missing indexes** — read the query plan first; an index may already exist but be unusable, and each index taxes writes.
- **Caching cheap things** — cache only what is expensive *and* re-read far more than written; every cache is a staleness bug waiting.
- **Pool/timeout knobs as fixes** — a bigger connection pool moves the queue; find what's holding connections.

## Excuses vs. reality

| Excuse | Reality |
|---|---|
| "This optimization is obvious" | If you didn't measure, you don't know. |
| "It's fast on my machine" | Profile on representative hardware, networks, and data sizes. |
| "It didn't help much but doesn't hurt" | Neutral complexity is a revert. |
| "Users won't notice 100 ms" | They do, especially on interactions. |
