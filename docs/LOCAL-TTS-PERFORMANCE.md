# Local TTS performance checkpoint - 2026-10-21

Release 0.1.41 remains the downloadable application baseline. This checkpoint changes documentation only; the following in-memory reuse experiment is not shipped functionality.

## Method and results

Two fresh isolated Python processes each verified the existing private pack, imported its libraries, loaded Chatterbox Nano on CPU, and synthesized the same 48-character sentence twice with the amazing profile. The second call reused the first call's in-process model. Both calls validated finite, non-silent audio within the shipped duration limits and wrote exclusive, separate local WAV files. Networking was disabled through the existing worker policy and offline flags. The pack's shared output digest was unchanged. No build or packaging task ran concurrently; other normal desktop processes were present. Model and filesystem caches were not cleared, so these are fresh-process measurements, not cold-disk measurements. Four outputs are too few for latency percentiles or all-voice claims.

The profiling copy was derived from worker source SHA-256 `949907e4ed43d988489d6e3023c5a739061fad232c9bbec60195435aa2d4b3f9`. Only timing probes and a second generation/write were added. Original production source, pack worker, references and models were not edited. The private harness, logs and WAVs stay under .tools and are excluded from source/release assets.

All times in seconds:

| Process | Integrity verification | Imports | Model load | First generation | First WAV ready | Subsequent generation | Process wall time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 4.38 | 18.41 | 5.96 | 9.20 | 37.96 | 5.35 | 44.43 |
| 2 | 4.52 | 14.48 | 5.79 | 7.37 | 32.17 | 5.36 | 38.69 |

First WAV ready includes verification/import/load/generation/write inside the worker; process wall time includes both generations and shutdown. Subsequent generation excludes a second integrity pass, IPC and production bookkeeping. Output durations are stochastic; the repeated text does not imply equal audio duration. All outputs were 24 kHz. These figures cannot be substituted for an implemented resident worker's end-to-end latency.

Library imports and model loading are substantial recurring costs. The experiment supports evaluating bounded model residency before optimizing integrity verification. It does not justify caching trust, skipping hashes, weakening process containment or promising a particular speedup.

## Next implementation slice and acceptance gates

1. One workspace-owned resident speech process per active private pack, one request at a time, preserving the Windows kill-on-close job assigned at creation, explicit handle inheritance and OS-only environment. Start lazily. A proposed initial idle budget is 60 seconds; release the process/model on idle expiry, app exit, pack change or validation failure. Measure actual memory before finalizing the budget.
2. Add a bounded, versioned stdin/stdout request-response protocol with request IDs and timeouts. Keep text out of shell arguments and logs. Enforce the existing text, voice, waveform and payload limits, plus a bound on protocol frames; malformed/oversized output tears down the worker. Capture only protocol stdout; diagnostic stderr must remain isolated from it.
3. Retain full pack provenance verification for each request. If any required file changes or fails validation, refuse synthesis and destroy the resident model. Do not reuse a model across roots or adopt verification-cache shortcuts. The subsequent-generation timings above omit this cost.
4. Continue random per-request output isolation and known-file cleanup. Reusing a process must not reuse output filenames across jobs or permit caller-supplied arbitrary paths. Bind accepted output to the active request and checked job root; preserve unknown or linked content.
5. Cancellation and timeout kill the resident worker and its descendants, then clear active ownership. The next request starts fresh. Discard late/stale replies by request ID and generation epoch; never allow a cancelled request to play or delete another request's files. Do not silently retry speech after a cancellation.
6. Exercise all five permitted voices, reference switching, mixed short/long text, invalid frames, invalid provenance, cancellation at import/load/generate, forced parent exit, idle expiry, worker crash and restart. Verify actual WAV validity, real native reader playback/end events, no app-side network, unchanged private pack output and exact descendant cleanup.
7. Measure fresh and resident end-to-end latency and process memory under a declared workload. Include the per-request integrity check, IPC and WAV handling. Keep private audio local. Accept only meaningful measured benefit with bounded resource use; retain the current isolated one-shot worker if these gates fail.
8. Settle the application version/source, then repeat native tests, real voice/reader/combined ownership suites, Windows portable/installer verification and current Android release gates. Publish paired verified artifacts before calling an application update delivered.

Stale crash-scratch collection and compact reader playback controls remain separate roadmap items. Hosted Actions still cannot start runners because GitHub reports an account payment/spending restriction; a YAML change cannot resolve that account condition.
