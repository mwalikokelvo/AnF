# Observability & Instrumentation

Open this when the feature runs in production, does background or networked work, or could fail in ways a user wouldn't report clearly. Instrument as you build — the first incident is the most expensive time to discover you're blind.

## 1. Define "working" first

Write 2–4 questions the on-call person (often: you, later) must be able to answer, e.g. "Are syncs succeeding?", "How long do exports take?", "Which plugin crashed the app?". Instrument to answer those, nothing more.

## 2. Pick the right signal

| Question | Signal |
|---|---|
| What happened to *this* request/user/job? | Structured log event (or trace) |
| How often / how fast / how many, over time? | Metric |
| Where did the time go across components/services? | Trace spans |
| Is it broken right now and does someone need to act? | Alert on a metric |

## 3. Structured logs

- One event per meaningful outcome, as structured key-values (JSON), not prose: `{"event":"export.completed","entries":412,"duration_ms":830,"format":"csv"}`.
- Levels mean something: `error` = someone should look; `warn` = degraded but handled; `info` = business events; `debug` off in production.
- Include correlation IDs (request/job/session) so events can be joined.
- Never log secrets, tokens, passwords, or personal data; log IDs instead.
- Use the project's logger, not `console.log`/`print`.

## 4. Metrics

- For request-like work, RED: **R**ate, **E**rrors, **D**uration (histogram, look at p95/p99, not averages).
- For resources (queues, pools, disk), USE: Utilization, Saturation, Errors.
- Keep label cardinality low — never user IDs or free text as metric labels (that's what logs/traces are for).

## 5. Tracing

If the request crosses processes/services (app → API → worker), propagate trace context; auto-instrumentation (OpenTelemetry) makes this cheap. Add manual spans only around meaningful work.

## 6. Alerts

Alert on symptoms users feel (error rate, latency SLO burn), not causes (CPU at 80%). Every alert needs an action; a noisy alert trains people to ignore the real one. Small personal projects usually need crash/error reporting (e.g. Sentry-style) more than paging.

## 7. Verify the telemetry itself

Trigger the success and failure paths once and confirm the events/metrics actually appear with the right fields. Telemetry that was never seen working doesn't work.

## Desktop & mobile apps

There's no server log to read. Capture crashes and unhandled errors with a crash reporter (opt-in where privacy requires it), write a local rotating log file the user can attach to a bug report, and include app version + OS in every report.

## Excuses vs. reality

| Excuse | Reality |
|---|---|
| "I'll add logging after it works" | "After" becomes "after the first incident". |
| "More logs = more observability" | Three queryable events beat three hundred prose lines. |
| "console.log is fine for now" | It can't be filtered, correlated, or alerted on. |
| "Alert on everything, tune later" | The tuning never happens; the real page gets missed. |
