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
