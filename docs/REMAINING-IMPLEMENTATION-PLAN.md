# Remaining implementation and delivery plan

Updated: 2026-10-18. Release baseline: AnF 0.1.31.

This is the consolidated inventory of known unmet requests, partial capabilities,
and verification gaps. It covers the code and earlier requested scope; it cannot
promise that no undiscovered bug exists. Detailed source evidence is in
IMPLEMENTATION-AUDIT.md. A connector, a working local fixture and a live service
are different completion states. No schedules below imply work already done.

## Completed baseline — do not rebuild these as missing features

Governance/worktrees, source rebrand with legacy-data compatibility, inline reader,
mandatory current Android artifact gate, bundled OFL fonts/licensed font imports,
and five real Windows local synthesis providers are implemented. Windows installer
and portable ZIP and Android development APK 0.1.31 were built and verified.
Native tests: 72 passed, 12 ignored. Reader/connection/native voice UI checks passed.
The private five-voice pack passed full ZIP integrity verification. Existing local
writing, calendar ICS, SVG planning, music library, playlists, LRC, local recap,
encrypted backup and paired project exchange remain available.

## Release and installation (first priority)

| ID | Remaining gap | Implementation / integration | Completion evidence |
| --- | --- | --- | --- |
| REL1 | Windows installation experience unverified on user's PC | Reproduce the exact installer launch/error; exercise clean install and upgrade in an isolated Windows environment; diagnose app/engine file locks and shortcut behavior. Add installer smoke checks. | Install, launch, upgrade and uninstall tests preserve user data; user can launch the delivered installer. |
| REL2 | Production signing absent | Add protected Windows signing and Android release-key workflows; verify signer identity and keep development artifacts distinctly labelled. Requires provisioned signing credentials. | Verified production signatures and upgrade continuity; keys never enter Git or logs. |
| REL3 | Android installed-device QA absent | Install in an emulator and physical phone; test new-identity export/import, permissions, rotation, process death, background audio and low storage. | Device reports with retained original backup, correct conversation counts and working attachments; no old-app deletion. |
| REL4 | Reliable public delivery/updater not implemented | Choose a release host and update policy; publish only after explicit publication authorization; attach versioned artifacts/checksums and implement signed update verification/rollback. | Download/install/update from clean device; invalid updates rejected. Local files alone are not hosted downloads. |
| REL5 | Hosted CI not executed here | Resolve runner/account availability; run Windows/Android required gates remotely, then Linux/macOS jobs as platforms mature. | Successful hosted run tied to exact source/artifact hashes. |
| REL6 | Large installer and voice startup cost | Split optional models into versioned verified component downloads; measure CPU voice latency and implement a bounded persistent local worker/preloading with cancellation. Keep offline installation possible. | Smaller core installer; measured first/subsequent speech latency and memory; no cloud fallback or stale jobs. |

## Reading and local intelligence

| ID | Remaining gap | Implementation / integration | Completion evidence |
| --- | --- | --- | --- |
| READ1 | Android original PDF pages absent | Add native PDF rendering into the existing Documents canvas, bounded page cache, zoom and anchored overlay annotations. | Image/text switching, page accuracy, memory/cancellation and annotation tests on phone. |
| READ2 | Android scanned-document OCR absent | Integrate licensed offline OCR with image preprocessing and cancellable page jobs. | Scanned PDF corpus produces searchable text offline without memory spikes. |
| READ3 | Windows OCR quality defect | Retain the failing 'seven letters' fixture; separate OCR resolution from display sizing and tune preprocessing/model. | Existing expectation passes plus representative noisy/rotated/multilingual corpus; no weakened assertions. |
| READ4 | EPUB/Word only extracted text | Build format-aware content models: EPUB spine, images, tables, footnotes and semantic headings; structured DOCX blocks. Sanitize content. | Format corpus preserves reading order, links and notes; safe malformed-archive handling. |
| READ5 | Advanced accessibility and languages incomplete | Add chapter/heading/table navigation, accessible names and keyboard shortcuts; test screen readers, RTL and multilingual pronunciation. | Assistive-technology and multilingual device tests. |
| READ6 | Custom voices unavailable on Android | Benchmark a licensed mobile CPU/GPU inference runtime and quantized model; implement native lifecycle/download/storage integration. Offer explicit paired-PC speech as an optional alternative. | Real new-text synthesis in airplane mode on supported phone; measured battery/RAM/latency; honest unsupported-device state. |
| READ7 | Custom voice word-level alignment absent | Evaluate local forced alignment; return genuine UTF-16 word offsets/time marks linked to generated audio. Keep current sentence fallback. | Unicode/pauses/rate-change fixtures align to actual audio, without estimated word timers. |
| READ8 | Phone-only AI absent | Choose supported on-device model/runtime based on phone benchmarks; add bounded model installation, streaming, cancellation and resource policy. | Chat/document questions work offline without PC/API key; grounded citations and low-memory recovery. |
| READ9 | Whole-book skill analysis incomplete | Process chapters in a resumable coverage ledger; generate skills with page citations; validate frontmatter and exact source hashes. | Every chapter explicitly covered or reported skipped; references trace back to original text. |
| READ10 | Writing review evaluations incomplete | Add editable before/after suggestions with local-model tests preserving numbers/names/quotes/meaning and user voice. | Golden cases detect factual changes and unsupported additions; user accepts changes explicitly. |

## Music and media

| ID | Remaining gap | Implementation / integration | Completion evidence |
| --- | --- | --- | --- |
| MUSIC1 | Spotube live provider 401 unresolved | Collect redacted provider diagnostics, repair reconnect/token refresh and propagate playback errors into AnF. Test the actual account. | Live track position and duration advance with audible playback; reconnect succeeds. Existing transport fixtures do not prove this. |
| MUSIC2 | Android native Spotube AAR missing | Build pinned Flutter AAR/ABIs, bundle host and connect existing Audio default route/lifecycle/transport. | Current APK contains native runtime; search/play/background/resume tested on device. |
| MUSIC3 | Podcasts/audiobook online discovery absent | Add bounded RSS/catalog adapters, subscriptions, chapter metadata, licensed streams and cache/progress integration. | Real feed refresh, episode/book play, interruption/resume and unavailable-source handling. |
| MUSIC4 | Video/music-video switching absent | Add native video playback and explicit audio/video rendition mapping for available licensed/user media. | Synced switching preserves position; codec/network/background tests. |
| MUSIC5 | AI DJ/daylist/recommendations partial | Build consented local history/features, deterministic recommendation baseline, then optional local model commentary and scheduling. | Repeatable personalized queues, skip feedback, no invented tracks and smooth speech/music transitions. |
| MUSIC6 | Online lyrics/SongDNA absent | Add permitted metadata/lyric providers with source attribution and timed-text model; verified creator/producer graph. | Accurate credits, synchronized lyrics, missing-data/rights states and caching policy. |
| MUSIC7 | Jam/Blend/collaborative playlists absent | Extend authenticated pairing with session authority, shared queue operations, stable IDs, conflict resolution and taste blending. | Two real devices add/reorder/play; reconnect and concurrent-edit tests preserve queue. |
| MUSIC8 | Cross-device handoff/Connect absent | Implement paired-device discovery, playback ownership transfer, media availability and position negotiation; add hardware adapters separately. | PC/phone handoff resumes accurately; revoked/disconnected devices cannot control playback. TV/car/speaker support needs its own tested adapter. |
| MUSIC9 | Offline provider downloads and quality guarantees absent | Add source-specific authorized caching, quotas, format negotiation and verified lossless playback path where available. | Real offline playback, expiry/revocation handling and codec/output checks. Catalog size, ad-free access and unlimited books depend on source entitlements; code cannot grant those. |
| MUSIC10 | Rich annual recap partial | Extend local stats with artist/genre/year history, explainable summaries and exportable recap views. | Listening/seek/sleep rules produce correct totals; historical-year and privacy tests. |

## Connected workflows — keep useful key-free local paths

No service instance is deployed yet. Local notebook/search, writing, ICS, encrypted
backup and user-run automation must remain available independently of optional
accounts. Local models may require an initial download, not paid API credentials.

| ID | Remaining gap | Implementation / integration | Completion evidence |
| --- | --- | --- | --- |
| CON1 | Open Notebook adapter not live-validated | Add guided optional local service setup/health check and job polling; integrate ingestion, retrieval and citations. | Real imported source completes processing and cited answer resolves correctly. |
| CON2 | OmniRoute not live-validated | Offer optional local gateway setup, model discovery and explicit routing; test authentication/rate limits/cancel. | Real selected model responds; routing visible; no silent provider switch. |
| CON3 | Creative media actual generation/import incomplete | Support a local generator where hardware permits; finish optional remote job polling, validated output import and restart recovery. | Real generated artifact opens/saves; quotas/errors/cancel/restart tested. SVG planning remains separately labelled. |
| CON4 | Cal.diy booking lifecycle absent | Add optional self-host setup, availability/timezone integration and explicit booking/reschedule/cancel actions. | DST, duplicate-click and attendee tests against running instance. |
| CON5 | Nextcloud continuous sync absent | Extend encrypted backup adapter with ETags, conflict copies, retry/resume, revocation and explicit background settings. | Interrupted/concurrent edits restore correctly; credentials and encrypted content protected. |
| CON6 | n8n autonomous rules absent | Add local bounded trigger/action engine and optional self-host service bridge, history, idempotency and recovery. | Previewed rules execute once, recover after restart and expose failures; no arbitrary remote commands. |
| CON7 | Android connector parity absent | Implement platform secure credentials, network bounds and lifecycle-aware request adapters for each supported connector. | Mobile live workflows plus timeout/cancel/credential-revocation tests. |
| CON8 | Unified usability incomplete | Move optional setup out of everyday Home; present working local actions first, contextual help, clear readiness and one canonical control per function. | Screenshot/keyboard/mobile walkthrough completes reading, research, music and writing without duplicate controls or dead ends. |

## Data, security, platforms and tooling

| ID | Remaining gap | Implementation / integration | Completion evidence |
| --- | --- | --- | --- |
| DATA1 | Backup scope incomplete | Define explicit backup categories for original PDFs/music/fonts/private voice assets; add opt-in encrypted asset manifests and quota/progress UI. | Full restore into clean profile; omitted assets clearly listed, no mistaken 'everything synced' claim. |
| DATA2 | Pairing/cross-version resilience unverified | Version schemas, persist transfer checkpoints and test conflicts, revoked peers and interrupted pairing. | Real PC/phone cross-version recovery preserves text and reading anchors. |
| DATA3 | Large collections unmeasured | Add virtualization/pagination, deduplication, quota UI and incremental audiobook indexing after measuring baseline. | Published large-corpus latency/memory measurements and restart-safe imports. |
| SEC1 | Strix scan not run | Provision reviewed CLI, Docker and usable model, scan authorized source copy, triage and fix findings. | Completed scan report and remediation retest; missing prerequisites stay a failure. |
| SEC2 | Parser/runtime hardening and ignored tests | Review voice/font/document/media input boundaries; classify 12 ignored native tests and execute where dependencies exist; fuzz malformed inputs. | Tests cover limits, cancellation, corrupt assets and recovery; reasons recorded for remaining skips. |
| PLAT1 | Linux release unverified | Finish WSL/restart/toolchain prerequisites, compile/package, implement platform renderer/speech fallbacks and GUI smoke. | Installable Linux release and portable artifact verified in Linux. |
| PLAT2 | iOS absent | Define iOS app/runtime and parity scope; obtain Mac/Xcode/signing environment; implement document/audio/storage integrations. | Signed device build and lifecycle tests. User currently has no Mac/developer account. |
| PLAT3 | Separate macOS app parity incomplete | Port shared workflows, replace Cursor/Codex readiness stub with real tested hooks, compile on Mac. | Native Mac build and actual integration checks; separate version tracked. |
| PLAT4 | Portable user-data mode absent | Define portable vault/key policy with explicit portable-root marker; remove hidden machine dependencies for supported features. | Removable-drive tests across two PCs with recoverable encrypted data and no loss. |
| TOOL1 | Ruflo/rea plugin installation incomplete | Inspect pending marketplace commands/manifests; use supported Codex plugin or pinned MCP path after reviewing declared capabilities. | Manager reports installed and a relevant tool smoke test passes; source download alone is insufficient. |
| TOOL2 | NVIDIA nim-anywhere incompatible marketplace | Treat as optional service/deployment project, evaluate hardware and supported interface; do not claim plugin install. | Working explicit adapter/service health and task output, or documented unsupported environment. |
| TOOL3 | Baseten/OpenRouter concrete packages unspecified | Resolve organization URLs to official specific integration/API/MCP packages; keep paid/account services optional. | Exact package/provider selected, configured and tested; no API keys required for core local features. |

## Dependency order and release-sized batches

1. Delivery reliability: REL1–REL5; confirm user can install31; close phone migration
   QA. Keep every application update paired with verified Windows/Android downloads.
2. Repair current failures: MUSIC1, READ3, SEC1–SEC2. Avoid adding catalogs while
   playback and OCR remain unreliable. Record real account/environment dependencies.
3. Offline reading performance/parity: REL6, READ1–READ8; DATA1/3 support larger
   content. Ship smaller complete reader increments with device benchmarks.
4. Complete learning workflows: READ9/10 and CON1/2/8; deploy optional services only
   after local workflows are usable. Evaluate each real workflow end to end.
5. Media foundation: MUSIC2–MUSIC4/6/9, then MUSIC5/10, then MUSIC7/8. Stable IDs,
   playback state and history must precede social/handoff features.
6. Connected productivity: CON3–CON7 with DATA1/2; one connector per tested release.
7. Platform expansion: PLAT1/4, then PLAT3/2 as environments become available.
   TOOL1–TOOL3 are supporting capabilities, not prerequisites for app completion.

For each row: reproduce/design → small implementation → focused regression and
failure tests → native/device walkthrough → current Windows/Android packages →
checksums/download links → update this inventory. Mark external dependencies as
blocked explicitly; do not replace implemented behavior with a setup card. Do not
assign completion dates until benchmarks/environment checks establish effort.

## Android31 delivery and installation scope

Use releases/AnF-Android-0.1.31-debug.apk (15,431,185 bytes), NOT the unsigned APK.
It has a verified development certificate and application ID com.anf.workspace,
versionCode1031. Transfer that APK to the phone and open it there. The old app
must remain installed until export/import and content comparison succeed.

Native package/source/assets/alignment/signature checks pass; physical-device
installation has not been demonstrated. Custom reference voices are Windows-only;
Android currently offers installed device TTS. Embedded online Spotube and phone-only
AI remain listed above rather than implied by the APK download.

## 0.1.32 verified source progress

- CON2: real OmniRoute3.8.51 local discovery and generation passed through a bundled
  model; actual workspace UI discovery/selection/save/Chat flow passed with isolated
  IPC persistence, and native HTTP adapter test passed separately. Guided setup is
  implemented. Managed service installation/start/updates and cloud-provider live
  verification remain open.
- REL1: upgrade identity selection fixed; eight isolated tests execute the actual
  NSIS template with an inert payload and unique registry namespace. User's live
  installation records unchanged. Production installation/startup on a clean PC and
  signing remain separate requirements.
- READ3: original scanned-PDF regression fixed by avoiding upscaling. New strict
  corpus still exposes El→Fl recognition; retain this diagnostic and improve the
  model later. Do not mark overall OCR quality complete.
- A03/MUSIC2: module identity and Windows tool invocation fixes integrated. Actual
  Android native music AAR/build prerequisites and device playback remain open.
- Release gates: Android32 built/verified; native32 suite79pass0fail14ignored and
  native32 UI/PDF/connection/export checks passed. Windows32 production package is
  still being built; no completed32Windows download claim until integrity checks.
