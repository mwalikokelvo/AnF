# Implementation audit and next-run roadmap

Audit date: 2026-10-17. Baseline: local Windows 0.1.30 source, captured in sprint
snapshot `7c98419`; the implementation sprint targets 0.1.31. This inventory is
updated as specialist results are integrated. A source implementation, an executed
test, a built package and a live provider/account check are different evidence.

## Coverage and method

The initial census reviewed 277 non-generated source/config/test/document files
under Windows, Android, the separate macOS app, integrations, scripts, workflows
and docs. Git internals, dependencies, build outputs, private assets and model
weights are outside the source audit. The raw census is retained locally under
`.tools/implementation-audit-census.json`; it is not a public diagnostic upload.

There are three explicit `coming soon` text markers in the macOS application.
The two generic labels display catalog readiness; the substantive stub returns
false for Cursor/Codex hook status. No explicit TODO/FIXME/HACK/XXX or Rust
`todo!`/`unimplemented!` marker was found in the reviewed active Windows/Android
code. This does **not** mean the product is complete. Ninety-six lines mention
unsupported/unavailable conditions; many are deliberate input, codec, permission
or platform guards rather than missing implementations. Variables named pending
and input placeholders were excluded from the stub count.

The inventory below combines those findings with reachable UI/actions, native
commands, current tests, prior capability records and the user's requested scope.
An integration that has no configured service/account is not counted as verified
against that service merely because a local fixture passes.

## Current sprint acceptance matrix

| Requirement | Baseline gap | Required evidence in this sprint |
| --- | --- | --- |
| Governance/worktrees | No durable specialist protocol or blocking handoff gate | Committed protocol/handoff/decisions; four current-source worktrees; path/ownership/dirty-tree tests; executable shell modes |
| Complete source rebrand | Mixed product/class/package/path identifiers | Source/path census, import/build checks, encoded legacy compatibility with migration tests; historical Git/vendor binaries explicitly excluded |
| In-document reading | Reader was a fixed overlay requiring separate navigation | Inline Documents canvas on Windows/Android; transport, navigation cleanup, exact text anchors, original PDF/text coexistence, responsive/keyboard checks |
| Mandatory Android release | Repeated assets-only builds left APK at 0.1.21 | Actual current APK; package/version/source-content verification; every release workflow depends on successful Android build; failure blocks release |
| Fonts | Fixed generic families, no licensed import/extraction workflow | Redistributable font assets/licenses; bounded local font import/registration; reviewed extractor provenance and licensed-cache tooling |
| Custom voices | Recordings are not synthesis engines | Unchanged private originals; prepared references; pinned local model/runtime; real new-text synthesis with both references; menu/readiness/cancellation/fallback proof; no cloud processing |
| Exhaustive follow-on audit | Prior notes distributed across releases | This inventory plus consolidated HANDOFF.md/DECISIONS.md with owners, evidence, next actions and sprint order |

## Capability inventory

| ID / priority | Capability and status before integration | Evidence / remaining work and acceptance |
| --- | --- | --- |
| G01 / P0 | Safe specialist workflow: implemented in bootstrap | PROTOCOL.md; scripts/worktree-manager.mjs and verify-agent-gate.mjs. Test traversal/ref/overwrite rejection, dirty-tree retention, valid removal and Windows long/short path identity. |
| G02 / P0 | Release publication: intentionally disabled | Workflows' publication guards remain. Building is authorized; public upload/push is a separate operation. Native installers are unsigned; production distribution/signing review remains. |
| G03 / P0 | Identity/data migration: in this sprint | New Android identity requires explicit old-app export/new-app import, not private-sandbox access. Preserve old app. Desktop data, encrypted AAD, keyring records, IndexedDB and backup formats need legacy compatibility; test real migration copies. |
| G04 / P0 | Source/release version consistency: in this sprint | New source target 0.1.31; previous 0.1.30 artifacts must remain unchanged. Cross-check native, npm, Android manifest/code and artifact names. |
| R01 / P0 | Inline document reading: in this sprint | reader.ts/css, both main.ts surfaces, speech-player.ts and reader-local.mjs. Keep controls in Documents, stop on navigation, preserve exact UTF-16 annotation anchors and saved position. |
| R02 / P0 | Custom local speech: in this sprint | Asset specialist must verify actual generated new text with both supplied references. Sample playback, an unavailable menu item or a fake timer is not synthesis. Preserve watermark behavior of the chosen engine. |
| R03 / P1 | Word/sentence highlighting: in this sprint | Use actual engine boundary callbacks; Android TTS onRangeStart must preserve utterance IDs and offsets. Custom providers without alignment expose sentence precision honestly. No inferred word timing. |
| R04 / P1 | Original PDF: implemented on Windows only | Bounded retained-source native rendering, serial work, stale-response cancellation and image cache exist. Android original-layout canvas/annotations are not equivalent yet; implement/test separately rather than claim parity. |
| R05 / P1 | OCR quality: known failing optional real fixture | reader.rs scanned-PDF test misreads “seven letters” as “seven etters.” Keep expectation, isolate OCR from preview sizing, establish corpus and improve preprocessing/model before claiming reliable OCR. |
| R06 / P1 | Scanned PDFs on Android: absent | android/web/documents.ts reads selectable text; empty text explicitly requests OCR. Add a licensed offline engine and scan fixtures; bound image memory and cancellation. |
| R07 / P1 | EPUB/Word layout: extracted text | Book spine/text processing exists. Images, tables, original typography, rich footnotes and embedded media need structured rendering and format-specific fixtures. Protected books remain unsupported. |
| R08 / P1 | Reading notes/search/resume: implemented, regression sensitive | reader-data.ts, reader.ts, native preview command and sync conversion tests. Verify combining marks, surrogate boundaries, duplicate IDs, stale images, EOF and changed source text after every migration. |
| R09 / P1 | Font ingestion: in this sprint | Font extractor only finds/copies local cached fonts; its code license grants no font rights. Ship open defaults and licenses, register user imports, reject malformed/oversized fonts, persist safely and handle removal/restart. |
| R10 / P2 | Advanced reading structure/accessibility | Semantic headings/table navigation, chapter/footnote recognition and multi-language pronunciation quality require dedicated corpora and assistive-technology/device testing. Current text sections are not a full document semantic model. |
| A01 / P0 | Android packages: in this sprint | Build script existed but assets-only runs were accepted as progress without a blocking current-APK dependency. Require APK/AAB generation and independent artifact verification; no stale artifacts or assets-only bypass. |
| A02 / P1 | Android signing and installed-device QA | Debug and unsigned packages have distinct statuses. Verify a production signature before describing an unsigned APK as installable. Physical-device/emulator install, process death, permissions, background audio and migration tests remain separate from package validation. |
| A03 / P1 | Android native Spotube | Java host/bridge and Flutter build recipe exist, but no current generated AAR was available at sprint start. A local-library APK is not proof of embedded online music. Build pinned AAR, bundle correct ABI and test native view/lifecycle before claiming parity. |
| A04 / P1 | Android standalone AI: absent | Android Chat uses paired Windows offline AI or explicit browser-account handoff. Local document/writing features work; phone-only model inference requires a mobile runtime/model and device resource budget. No API subscription does not imply phone-only inference. |
| A05 / P1 | Android service connectors: not desktop parity | Native credential/network adapters are Windows implementations. Design mobile secure storage and request guards before exposing equivalent online actions. Do not embed developer credentials or silently proxy private text. |
| M01 / P0 | Local music/audio playback: implemented | Music Hub supports local queue, playlists, file categories, spoken resume, speed/sleep, LRC and annual local totals. Validate actual engine rate after load, codec errors and single-engine handoff; imported audio is limited by storage/codec/file bounds. |
| M02 / P0 | Spotube provider authentication: unresolved | Prior live UI returned 401 and a non-advancing 0:00 item. Bridge/WAV fixtures prove transport, not provider access. Reproduce with redacted diagnostics, reconnect provider, verify advancing live playback/duration; never fabricate success or bypass account rights. |
| M03 / P1 | Online podcasts and audiobook discovery: absent | Local imported episode/book files exist. Add RSS/catalog parsing, safe fetch/redirect bounds, metadata and licensed streams, then offline cache/progress and feed-update tests. |
| M04 / P1 | Video and audio/video switching: absent | No in-app video catalog or synchronized alternate rendition pipeline. Requires a video player, licensed/user media sources, time mapping and device/codec fixtures. |
| M05 / P1 | Personalization and AI DJ: partial local filters only | Liked/recent/not-recent collections are deterministic. Mood/daylist models, curated release discovery and spoken DJ commentary need real input data, optional local model and tested transitions; no invented catalog. |
| M06 / P1 | SongDNA/lyrics: local metadata and LRC only | No licensed online lyrics lookup or verified songwriter/producer/origin graph. Add provenance, permissions, synchronization and missing-data states. Do not infer credits as facts. |
| M07 / P1 | Social Jam/Blend/live playlists: absent | Playlist recipe files exchange metadata and match local files; no shared real-time session. Need pairing/authentication, authority/conflicts, reconnect protocol and peer state tests. |
| M08 / P1 | Connect/cross-device handoff: absent | OS MediaSession controls exist. Handoff needs authenticated pairing, stable media identity/availability, position reconciliation, ownership and network recovery; no smart-speaker/TV/car implementation is claimed. |
| M09 / P2 | Offline catalogs/quality/recap depth: partial | Local files and source format metadata work. Provider downloads, licensed unlimited catalogs, lossless transport guarantees, artist/genre/persona annual recaps and historical-year selection are not implemented entitlements. |
| I01 / P1 | Open Notebook: configurable adapter | Existing-instance notebook/source exchange, bounded requests and fixtures exist. No server bundled or live deployment validated. Add job completion and retrieval/citation acceptance against a configured service. |
| I02 / P1 | Writing review: built-in prompts/checklists | No authorship detector. Add before/after evaluation cases preserving names, numbers, quotes and technical meaning; model output needs user review. |
| I03 / P1 | Book-to-skill: real reference ZIP, incomplete analysis coverage | skill-pack.ts exports exact sources/hashes and explicit unverified coverage. Whole-book chapter processing, coverage verification, source citations and frontmatter evaluation remain; do not claim every chapter was analyzed. |
| I04 / P1 | OmniRoute: optional gateway adapter | Explicit selection, local fixture/error/cancel tests and native credentials exist. No user deployment yet. Validate installed gateway/model version and live auth/rate limits; never silent cloud fallback. |
| I05 / P1 | Creative media: local planning plus optional job adapter | Local SVG/text planning is not generated video. Remote job ID persists; explicit submit/status exists. Actual provider generation, cost/billing approval, output import/validation and restart recovery need deployment tests. |
| I06 / P1 | Scheduling: ICS and booking-page handoff | No full availability/attendee/calendar integration or booking lifecycle. Add timezone/DST/duplicate-click tests and explicit booking changes against a real deployment. |
| I07 / P1 | Nextcloud: encrypted backup transfer | Not continuous conflict-aware sync. Add ETag/conflict/retry/interrupt/revocation handling and test restore before background transfer. No server bundled. |
| I08 / P1 | n8n: reviewed webhook delivery | No installed automation service or autonomous/background rule engine. Add explicit bounded triggers, execution history, idempotency/recovery and deployment tests; keep remote-command execution out. |
| D01 / P0 | Private storage/backups: implemented with migration risk | SQLCipher/native key storage and encrypted backup restore exist. Original retained PDFs, music blobs, voice references and font assets have distinct storage/backup scope; avoid claiming everything is in the project vault or synced. Test old-key/AAD restoration after rename. |
| D02 / P1 | Cross-device project sync: bounded paired transport | Document opt-out, anchors and conflict copies exist. Voice/font/media binaries and original PDF files are not automatically transferred. Cross-version schema and interrupted pairing recovery require device tests. |
| D03 / P1 | Large-library responsiveness | Local library filters currently render the matching set. Pagination/virtualization, duplicate import detection, storage quota UI and long audiobook chapter indexing need larger fixtures and measured latency. |
| S01 / P0 | Strix: preflight only, no completed scan | scripts/security/strix.mjs honestly exits when CLI/Docker/model unavailable. Provision reviewed tools and a usable model, scan source-only copy, retain findings and remediation; missing prerequisites are never a pass. |
| S02 / P1 | Security/recovery depth | Native workspace-window checks, retained-file bounds, crypto and fixture tests exist. Voice/font parsers/model loaders add new attack surfaces: pin/hash assets, no untrusted pickle/remote code, bounded worker/output/cancellation, no shell interpolation or sample uploads. |
| P01 / P1 | Linux: source/platform workflow exists, local package unverified | WSL setup was authorized but restart was pending. Run actual Linux toolchain/build/package/GUI smoke; document unsupported Windows-native renderer/speech features and verify a Linux portable distribution independently. |
| P02 / P2 | iOS: no current implementation/build proof | User has no Mac/Xcode or developer account. A macOS app is not an iOS port. Define iOS target/runtime, obtain build environment and signing, then test device storage/audio/reader parity. |
| P03 / P2 | Separate macOS native app parity | Swift app has independent version/history and Cursor/Codex readiness stub in IslandViewContent.swift. Catalog display helpers show coming-soon status. No Mac compile was run here; port shared capabilities and replace stub only with tested integration. |
| P04 / P2 | True portable data mode | Windows ZIP includes executable/resources. Running without an installer does not establish that every data/keyring path is removable-drive-contained. Define a portable vault/key policy and test different PCs/removable paths before promising portable user data. |

## Edge cases and intentional limits

- File/path/XML/archive/URL validators and unsupported codec/platform messages
  protect the app; they are not permission to remove guards for apparent feature
  completeness. Test invalid Unicode, archive expansion, stale requests, model
  cancellation, quota exhaustion and disconnected engines.
- Current document/source, response, annotation, request and export limits are
  deliberate bounded contracts. Raising them requires measured memory/latency and
  recovery evidence, not a UI string edit.
- Legacy identifiers may remain only as encoded migration/protocol constants;
  otherwise changing them can destroy encrypted compatibility. Git history and
  original third-party attribution cannot be rewritten to make a text scan green.
- A new Android app identity changes sandbox and browser-origin state. Test
  export/import into a clean install, with the old app retained, instead of an
  uninstall/reinstall procedure that loses the only copy.
- Default fonts and default installed voices must remain usable without network
  or API keys. Custom local model setup can require downloads; actual inference
  must run with network disabled and produce distinguishable speech from new text.

## Prioritized next-run sprint plan

1. **P0 migration and release reliability:** finish this sprint's acceptance matrix,
   verify actual Windows/Android artifacts, installed migration and offline custom
   voice evidence. Repair any gate failure before adding more product surfaces.
2. **P0 playback/OCR/security:** reproduce provider 401 with a real configured
   account, fix and verify playback; retain an OCR corpus and fix the known
   spelling case; provision Strix, scan, triage and remediate source findings.
3. **P1 reading and phone parity:** Android OCR/original pages, mobile standalone
   inference decision, device TTS boundary/audio lifecycle checks, structured
   EPUB/Word reading, font/voice asset backup policy and large-library performance.
4. **P1 complete one online workflow at a time:** deploy/test research retrieval,
   chapter coverage, generated-media output import, calendar lifecycle and safe
   backup conflicts with configured services. Preserve optional/key-free local
   alternatives and explicit provider selection.
5. **P1 listening expansion:** safe feeds/streams, audiobooks/chapters, video player,
   licensed lyric/credit metadata, paired social queue and authenticated handoff.
   Each needs a working vertical flow and failure/reconnect fixtures before labels
   such as Jam, DJ or Connect are advertised.
6. **P2 platform/distribution:** Linux native/portable verification, signed Windows
   and Android packages, macOS parity and iOS environment/target implementation.

HANDOFF.md records actual commits, integration state, gates, artifacts and the
first successor action. DECISIONS.md records the migration/model/licensing choices.
This roadmap records work still needed; it is not a declaration those features
were implemented by the current sprint.
