# AnF 0.1.41 preview

Local custom speech writes each request into a fresh random folder under the profile's voice-jobs storage. The app embeds its current worker and continues using the existing private pack's models, references and integrity checks. It never reads, deletes or overwrites the pack's shared output.wav. Completed and cancelled requests clean only their own two known files; unexpected files cause preservation rather than recursive deletion. Audio reads are bounded to 5 MB and require WAV headers. Request text travels through stdin, never a shell or text file.

Windows 10+ assigns the speech process to a private kill-on-close job at process creation using [PROC_THREAD_ATTRIBUTE_JOB_LIST](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute). Only the stdin and NUL output handles are inherited. The job handle stays with AnF, job membership is checked before resuming the child, and Python starts in isolated/no-bytecode mode with a small OS environment allowlist. Provider keys, proxies and Python-path overrides are excluded. Cancellation/timeout and graceful exit stop owned speech; forced parent termination closes the job and stops its processes.

## Evidence

The standard native suite passed 106 tests, with 17 ignored. A separately executed Windows fixture verified Unicode stdin, omission of a harmless inherited-environment sentinel and termination of a genuine spawned descendant. Native five-voice QA generated new-text, non-silent 24 kHz WAVs, checked per-request job cleanup and unchanged private-pack output, rejected invalid/non-workspace requests, exercised stale-ID cancellation, played reader audio at 1.5x with real sentence highlight/end events, and confirmed forced app exit stopped a real speech process.

The first native run completed all five syntheses, cancellation and actual reader playback, then its final process probe missed a Windows verbatim executable path. The path comparison was corrected and the full suite repeated with the same application binary. The earlier failed report and log were retained.

Observed per-request synthesis times during this acceptance run (production packaging was running concurrently):

| Voice profile | Elapsed | WAV bytes |
| --- | --- | --- |
| amazing | 35.11 s | 144044 |
| always-forever | 39.60 s | 144044 |
| burt-preview | 35.21 s | 140204 |
| serafina-preview | 33.05 s | 146924 |
| kelvin-preview | 36.56 s | 176684 |

These are observations, not controlled cold/warm benchmarks or evidence of a latency speedup. The implementation still loads a fresh CPU worker per request. Model residency, persistent-worker protocol, lower latency and genuine word alignment remain future work.

A combined native suite also generated a local answer through managed OmniRoute, checked authentication/permissions/cancellation/restart and stopped coexisting gateway, model and speech processes on forced owner exit. Application-side proxy requests: 0. The shared managed process implementation is unchanged apart from command-line helper visibility; no component integrity check was removed. Windows verification matched all 593 portable files and ZIP CRC/SHA; current Android source/assets/native/signature/16 KiB gates passed. All ten uploaded asset digests were verified. Private recordings, derived voice models and QA audio were excluded from GitHub assets.

Hard app death can leave one bounded scratch job folder for inspection; stale-directory garbage collection is not implemented. Runtime caches remain in the private voice pack. Windows remains unsigned and Android development-signed, with phone-only custom inference and physical device validation still open. Hosted CI still fails before runner execution because of account payment/spending settings.
