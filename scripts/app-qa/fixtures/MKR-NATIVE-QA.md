# Disposable Windows MKR workspace acceptance

This is engineering QA, not a release or a provider integration. The test Java
catalog serves only generated AAC from its own JAR through a loopback range
server. It neither imports MKR's provider implementation nor accesses accounts,
user music or external services. Existing Kotlin/provider component acceptance
remains a separate requirement.

`prepare-mkr-native-qa.py` creates a fresh source snapshot under the existing
`anf-pr47-evidence` directory, reuses hash-checked JRE files from the engineering
runtime candidate, compiles the small Java fixture, and pins its exact inventory
in **that snapshot only**. Production `REVIEWED_MANIFEST` remains `None`.
The actual Tauri command module, Rust child supervisor and native decoder are
used. Native playback is muted in the snapshot. It has a QA app ID and unique
binary name, disables the shared installed-app relay listener, and uses a fresh
profile/home for each attempt. No live profile or application is uninstalled.

The preparation writes the paths to `latest-mkr-workspace-qa.json`. Build its
`source/windows` workspace with:

```powershell
cargo build --offline --locked -j 1 -p anf-mkr-qa --features embedded-mkr,embedded-music
```

The snapshot lock entry is renamed using the current workspace version, rather
than a fixed historical release number. `python -B scripts/check-mkr-qa-lock.py`
checks that only the app name changes and every locked dependency stays intact.
Preparation refuses a missing, duplicate, registry-backed or mismatched app
entry before copying files; do not regenerate the lock to hide such a failure.

Set `CARGO_TARGET_DIR` to the recorded engineering target directory before this
build, to reuse existing dependencies. The app name is distinct from AnF; never
overwrite or publish a normal AnF package. The snapshot builds only an rlib plus
its executable and omits app debug metadata: the original redundant
staticlib/cdylib/rlib build ran out of memory on the 8 GB test PC. These QA-only
settings do not alter production profiles or security settings.

After preparation, run `prepare-mkr-selftest.py` once before building the QA
snapshot. It installs test-only native report/fault commands and a Tauri page-load
hook that runs the DOM/native acceptance script inside its owned workspace.
These hooks never enter production AnF, and do not enable remote debugging or
relax IPC, file-integrity, CSP or Windows protections.

Run `node scripts/app-qa/run-mkr-selftest.mjs` from the repository. The older
`mkr-workspace-native.mjs` name forwards to it. It refuses non-QA identities,
copies a uniquely named executable, serves the snapshot's assets (including the
root island route) and waits for the isolated native report. Each attempt keeps
its log/report/profile. It never attaches to an existing user's AnF window.
Capabilities/playback states are not mocked. Failed/delayed acknowledgements are
injected in test-only Rust hooks at the real acknowledgement boundary: Tauri's
protected JavaScript IPC property cannot reliably be overwritten for testing.

Required checks include actual native duration/position, responsive pause during
slow catalog work, seek/queue, retained dock navigation, false/late handoff
rejection and reciprocal playback handoff with a real generated local WAV.
Renderer-only tests are not substitutes for this run.

The original debugger attempts were blocked before playback and remain failed
evidence. Ordinary Windows UI inspection found the root-route test-server bug;
it was corrected. The supported app-owned path now reaches actual Tauri/WinRT
playback without the debugger. It exposed a real asynchronous native Pause
acknowledgement race, which was fixed without weakening the tests. Refer to the
latest saved native report for the complete result; partial groups alone are
not a full acceptance pass. No policy denial was established or bypassed.
Production availability, actual service playback, Android and installable release
acceptance remain separate requirements.

For current-source hosted acceptance, `mkr-windows-workspace-qa.yml` creates a
fresh runner-only runtime, builds the current frontend and hook, and runs these
same six groups through the actual Tauri host. It generates its AAC with the
existing pinned media tool; it never copies user recordings or models. Hosted
fixture compilation requires the exact job-owned JDK and verifies its compiler,
JAR tool, release and API-source hashes against the audited vendor inventory.

The hosted build seals tracked production inputs and the disposable snapshot
before compilation, requires no pre-existing QA executable, then checks source
drift and records the built executable hash. The launcher checks the copied
executable against that receipt, which is included with the final result.
Tauri's generated JSON schemas are excluded from the snapshot source comparison.
`python -B scripts/check-mkr-workspace-receipt.py` tests the receipt guards without
launching anything. These receipts record the executed engineering build;
they do not assert reproducible compilation or extend historical results to
today's source. Only JSON/log reports are uploaded; no app, runtime, toolchain,
recordings, keys or installable packages are uploaded by this workflow.

Latest complete result (2026-10-30): all six native groups pass through the
app-owned runner, including reciprocal local WAV handoff. It caught and fixed
the native Pause acknowledgement race. Earlier incomplete fixture handshakes and
unsupported JavaScript IPC overrides were corrected in the fixtures, preserving
the host's strict protocol validation. Native-status assertions now wait for
the actual UI track-change command to finish, rather than probing a retired
lease mid-transition. Neither decoder errors nor failed assertions are ignored.

Current-source hosted results (2026-11-13) are **not** another six-group pass.
Run 43481172932 compiled the current engineering app and retained its source and
binary receipts, then failed the independent generated-file decoder test before
the in-app groups ran. A smaller native-only probe, run 43487469498, reproduced
the failure with numeric-only test diagnostics: the deliberately invalid file
reported `0xC00D36C4` (unsupported byte stream), while valid generated AAC failed
with `0xC00D36FA` (`MF_E_CANNOT_CREATE_SINK`). Both Windows audio services were
running; the runner reported no `Win32_SoundDevice` entries. This isolates the
failure below the catalog/UI layer; it does not by itself prove the precise
missing endpoint/driver configuration or a supported desktop playback pass.
Do not install virtual drivers, change protections or mark a mocked clock as
native acceptance. Resume actual playback QA on an appropriate Windows audio
environment; keep the historical pass and the current failure separate.

The engine retains per-source numeric failure codes and gives an actionable
message for output creation, device disconnection and audio-service failures.
It still rejects playback after failure; invalid/unknown media retains its
existing decoder error. No raw provider error text or private URI is logged.

For an audio-capable local Windows desktop, `prepare-local-mkr-inputs.py
--fetch-jdk` audits the existing pinned vendor archive before extracting a
portable toolchain under the evidence directory. It changes no installation,
registry or environment defaults. It builds a distinctly labeled fixture-only
JRE with a 256 MB Java heap, not a provider/runtime release. Preparation refuses
to replace an extracted toolchain or an active candidate pointer. Preserve and
inspect a partial preparation rather than deleting it or retrying blindly.

Pass its explicit `jdk` and `proof` paths to `prepare-mkr-native-qa.py` using
`--local-jdk` and `--local-jdk-proof`. The compiler/JAR tool and source metadata
are hash-checked against the audited input inventory before fixture compilation;
the tools use bounded heaps. Apply the self-test hook as above, then use
`mkr-workspace-receipt.py seal --local-desktop` before the fresh build and
`built --local-desktop` afterwards. Use a single Cargo job and
`CARGO_PROFILE_DEV_DEBUG=0` on small-memory PCs. Finally run
`run-mkr-selftest.mjs --require-receipt`; this requires the exact new binary's
receipt even outside a hosted job. Both paths retain the same isolation and
six-group assertions. Neither these inputs nor a successful component test
enable the production player or certify a release.

An additional local scope uses `prepare-mkr-selftest.py --speech-only` and
`run-mkr-selftest.mjs --require-receipt --speech-only`. It requires an installed
local WebView speech voice, genuine utterance start events and actual native
playback. Generated text is muted through the real utterance volume setting;
speech, voices, events and audio states are not substituted. It tests Writing
and Reader handoff while the current view stays open, since changing views can
itself stop speech and would conceal a failed handoff.

For a justified new local scope using the existing Cargo dependency cache,
`seal --local-desktop --replace-qa-binary` records the previous QA executable's
SHA instead of requiring an empty target. Completion refuses that exact old
binary; a changed, successfully built binary and unchanged sealed source are
still mandatory. Replacement is restricted to explicit local seal mode and the
fixed QA executable path. Archived uniquely named binaries and previous results
are preserved. Hosted/default preparation still refuses an existing binary.
