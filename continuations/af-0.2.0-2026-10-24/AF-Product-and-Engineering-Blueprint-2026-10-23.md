# Making A&F superb: product and engineering blueprint

23 October 2026 • Research and targeted source review • Proposed direction, not implemented changes

Implementation follow-up: work has begun on AF-01/02/03. See `AF-Implementation-Checkpoint-2026-10-23.md` for implemented changes and their exact verification limits. The findings below describe the baseline reviewed before those changes.

## The strongest opportunity

A&F can become a calm, dependable workspace for turning material into useful work: collect a document, understand a passage, write with evidence, listen while working, and resume on another device. Its advantage would be the continuity between those activities, local ownership of data, and useful operation on modest hardware.

The present project already contains many of the necessary pieces. The highest-value investment is making them behave as one dependable product. Protecting a draft, retaining a citation after reopening a conversation, and resuming a playlist after a phone locks will matter more than adding another destination to the navigation.

The user confirmed **a balanced workspace for all of these activities** after this review. Reading, writing, AI help, Music Hub and Audio Studio are therefore core product areas. Each major milestone should validate all three journeys below; the order of engineering work follows shared dependencies and risk rather than giving one area permanent priority. No particular audience, language, coworker assignment, release date, or commercial model has been established.

## What this review actually establishes

Reviewed the existing handoff/continuity, selected Windows and Android entry points, writing editor, reader, speech player, local search tools, backup/restore conversion, retrieval selection, Android media service/bridge, current build configuration, and selected verification artifacts. Consulted current primary documentation for platform constraints and useful product patterns. This is targeted source analysis, not a complete code/security audit or a visual usability test.

One narrow restore probe ran against the existing bundled `mobile-project-data.cjs` verification module. Other findings below are source observations or prior recorded build results. No production application source was changed, no new release was built, and no physical device was tested. The earlier handoff remains the source for artifact hashes and release status.

## 1. Concrete findings that should shape the work

| Finding | Evidence and certainty | Why it matters | Recommended correction |
| --- | --- | --- | --- |
| Ordinary Windows chat answers replace the current draft. | `windows/src/workspace/main.ts:124`: normal `ask()` assigns the reply to `draft.value`; continuation appends. Source-confirmed. | A user can carefully edit a letter, ask an unrelated question, and have the working draft replaced. This does not prove unrecoverable loss, but violates a strong user expectation. | Keep answers in chat. Offer explicit Insert, Append, Replace, and New draft actions. Require a reversible revision for Replace. |
| “Use this reply” also replaces the draft directly. | `main.ts:103`. Source-confirmed. | The same surprise can occur while browsing history. | Reuse one safe insertion/replacement mechanism across every AI entry point. |
| Long operations lock editing across the workspace. | Windows `setBusy()` at `main.ts:79`; Android `run()` at `android/web/main.ts:48`. Source-confirmed. | The user cannot keep writing while AI or another slow operation runs. Navigation remaining available on Windows does not make the editor writable. | Give jobs individual ownership and immutable inputs. Keep unrelated activities usable; check revisions before applying results. |
| Evidence is not retained with Windows chat turns in the reviewed format. | `Turn` at `main.ts:22` has role/text; `renderEvidence()` at line 109 replaces a separate panel; reopen paths clear that panel. Source-confirmed for this path. | An old answer can retain citation numbers without the original excerpt set needed to interpret them. | Persist immutable evidence and source-version references with each answer, including provider/model and processing mode. |
| Android backup restoration drops source page metadata. | `android/web/project-data.ts`, `restoreProjects()`, copies source name/text/reading state but omits optional `pages`. The existing bundled verification module reproduced 2 input pages → no restored pages; source text remained intact. | Text survives, but page-aware provenance becomes weaker after restore. This is not evidence that all backup content is lost. | Validate and preserve page number/text/OCR fields; test complete round trips and compatibility with old backups lacking pages. |
| The reader cannot yet provide durable, precise source navigation. | `reader-data.ts` clips text with a source name; annotations use text offsets. `reader.ts` displays extracted text in generated sections and stores fine scroll position locally. Source-confirmed. | A clipped quotation does not carry a stable document/page anchor, and local scroll position is not a cross-device location model. | Give documents stable IDs/versions and retain quote anchors plus page/section references. Keep the text reader while adding original-page navigation incrementally. |
| Retrieval is sharply bounded. | `windows/src-tauri/src/workspace.rs`, `evidence()`: approximately 450-byte chunks, at most four selected excerpts, substring frequency/rarity ranking, distributed sampling when terms do not match. Source-confirmed. | Useful for focused excerpts, but insufficient evidence to promise exhaustive long-document review or whole-library understanding. | Evaluate retrieval separately, preserve paragraph boundaries, budget context deliberately, and expose coverage. |
| Windows Flutter embedding is a feasibility dependency. | Current Flutter add-to-app documentation lists Android, iOS, macOS, and web, excluding Windows. The local handoff lists Windows hosting as unfinished. | An Android AAR success does not establish a supported Windows embedding path. | Prove a small custom Windows host integration before committing the whole music roadmap to it. |
| Product identity and protection messages have drifted. | Android settings include “Coucou 0.1.19”; Windows health text says storage is unencrypted while the product also offers opt-in vault protection. | Mixed branding and generic protection claims make users unsure which version and protection mode they have. | Generate version labels from build metadata and show actual repository/vault state. |

The Flutter constraint is based on [current Flutter add-to-app documentation](https://docs.flutter.dev/add-to-app). It does not mean a custom Windows host is impossible; its effort and behavior must be established experimentally.

## 2. Three journeys worth making excellent

### Understand a document and produce useful writing

1. Add a document; see import progress and whether it is available offline.
2. Read in a distraction-free view; select a passage and choose Explain, Save quote, or Add to draft.
3. Ask a question with the selected context visible. Show where processing happens: this computer, the paired PC, or an explicitly selected service.
4. Read an answer whose citations open the exact stored excerpt and, where possible, the source page.
5. Insert a useful paragraph into writing without replacing existing work. Review a suggested edit with a clear comparison and Undo.
6. Export a clean document, then reopen the project tomorrow with the draft, evidence, highlights, and position intact.

Acceptance example: importing a two-page test PDF, quoting page two, generating a response, accepting one revision, closing/reopening, backing up/restoring, and exporting must preserve the correct quotation and source location. Include accented text and supplementary Unicode characters in the fixture.

Zotero demonstrates a useful reference behavior: annotations added to notes retain citations and links back to PDF pages. A&F can adopt that continuity principle without attempting to recreate a full reference manager. [Zotero reader documentation](https://www.zotero.org/support/pdf_reader)

### Listen with no management burden

1. Choose device music or a folder; browse the existing library while scanning continues.
2. See skipped files, progress, cancellation and a useful completion summary.
3. Start a track; control it from the app, headphones and lock screen.
4. Move into reading or writing while playback continues.
5. Start read-aloud or an Audio Studio preview; the app transfers audio ownership predictably.
6. Return later to the queue and position without a second player unexpectedly resuming.

Local playback should remain useful when online music fails. Describe missing files and unavailable services with a practical next action. Recognizing a filename extension is not proof that a file will decode.

### Improve a recording safely

1. Import an original and create an Audio Studio project.
2. Preview a short selection, apply a small set of clearly explained controls, and compare at matched loudness.
3. Retain the original and an editable processing recipe; make the export destination explicit.
4. Export a new file with progress/cancellation and a result the user can locate.

Music Hub and Audio Studio should share media references where useful but retain distinct jobs and controls. Saving an editable project and exporting playable audio are different actions, a distinction also made in [Audacity's documentation](https://support.audacityteam.org/basics/saving-and-exporting-projects). A&F should explain this in ordinary language.

## 3. Make the interface calm and coherent

Keep a small set of stable destinations: Home, Library, Writing, Chat, Music, and Settings. Audio Studio may be a clearly named tool under Music or a separately accessible destination; test discoverability before changing the current separation. On phones, choose a limited primary navigation set with the rest available through a labeled secondary menu.

Home should answer “What was I doing?” Show the recent draft, reading position, active audio and one useful quick capture action. Keep habit tracking optional. Avoid turning the first screen into a dashboard full of unrelated counters.

Library should unify discovery through filters while retaining the difference between documents and playable media. A shared search box can find a document, note or track; each result should identify its kind and open in the correct tool. Users should not have to know where the app internally stores an item.

Onboarding should get a person to one successful task. Let them read/write before configuring AI accounts, local models, device pairing or broad music access. Request a capability when its action needs it, and explain an unavailable capability locally.

Use consistent type, spacing, icon meaning, action placement and status language across the WebView and Flutter surfaces. Preserve screen-specific strengths: a desktop split view for source and writing; a phone view focused on one task with a predictable Back action. Use genuine empty, loading, partial, cancelled and failed states rather than one generic busy message.

Accessibility acceptance should include keyboard-only use, visible focus, Narrator/TalkBack, text scaling, contrast, mobile keyboard/selection and reduced motion. WCAG 2.2 includes minimum pointer target size/spacing requirements; use larger primary mobile targets as an A&F design target and measure the rendered UI. Source labels alone do not establish accessibility conformance. [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Microsoft keyboard guidance](https://learn.microsoft.com/en-us/windows/apps/design/input/keyboard-interactions)

## 4. Architecture changes that earn their cost

### Preserve the current stack and clarify responsibilities

Keep Tauri/Rust, Android Java/WebView, shared TypeScript tools and the modified Flutter music module while addressing their boundaries. A wholesale rewrite would put existing storage, import, backup and audio behavior at risk without proving better daily workflows.

Introduce versioned domain contracts gradually:

| Domain | Essential state |
| --- | --- |
| Document | Stable ID, content version/hash, title, local availability, extracted text, page map, original-file reference, extraction/OCR provenance. |
| Annotation | ID, document/version, quote, prefix/suffix anchor, offsets, page/section where known, note, color. |
| Draft | ID, project ID, revision, text, ordered revision history, linked quotations. |
| Chat message | ID, text, context snapshot, evidence references, provider/model, job state and creation time. |
| Media item | ID, location or content URI, metadata, duration, artwork reference, availability; optional owned copy. |
| Audio Studio project | Original media ID, non-destructive recipe, output/job references and revision. |
| Job | ID, type, owning project, input revision, progress/stage, cancellation state, output or error. |

These are proposed contracts, not fields already implemented everywhere. Add schema versions and migration fixtures first; introduce adapters around existing storage rather than replacing all records in one release. Preserve old backups. A migration should be recoverable and should never silently reinterpret a source quotation against changed text.

Android's offline-first guidance supports a local data layer that remains usable without network access. Apply that principle to app-owned state; do not make the library wait for an online service to respond. [Android offline-first guidance](https://developer.android.com/topic/architecture/data-layer/offline-first)

### Replace global waiting with safe jobs

Every operation receives an immutable input snapshot and an owner. Results return to their original project even if the user navigates elsewhere. Closing a view does not accidentally erase a job or apply its result to another project.

If the user edits a draft during generation, retain the result as a proposal against its original revision. Do not apply it to a newer revision without review. Cancellation stops visible progress promptly; stages that cannot interrupt immediately must report that accurately and must not commit stale results afterward.

Start with AI jobs and exports. Avoid adding arbitrary parallelism: an 8 GB computer needs bounded queues and resource budgets, with playback protected from conversion/inference workloads.

### Give audio one owner

Coordinate Music Hub, browser/native queue, Audio Studio previews, and read-aloud under one host-level ownership protocol. Existing pause acknowledgements are a useful starting point, but TTS must participate too.

Use an ownership generation/lease so late responses cannot take control after a newer user action. A transition should finish only after the current owner confirms pause; a failure keeps the UI truthful and offers recovery. Decide explicitly whether reading aloud pauses or ducks music, and whether resumption is manual or automatic. Test interruptions before enabling automatic resume.

Android background playback belongs with an appropriate service/media session; the current Media3 service is a foundation to validate rather than discard. Bluetooth and lock-screen controls must operate on the actual active owner. [Android background playback guidance](https://developer.android.com/media/media3/session/background-playback)

### Complete device music discovery in a platform-aware way

Use MediaStore/content URIs for Android device audio and a document/folder picker for selected external locations. Use the existing bounded scanner for desktop folders. Do not force every Android track through a filesystem-path assumption or copy the entire library into app storage.

Persist metadata in batches, identify changes, evict rebuildable artwork/waveform caches, and expose skipped/unreadable files. Permission denial should leave app-owned and individually selected content usable. [Android shared-media guidance](https://developer.android.com/training/data-storage/shared/media)

### Prove Windows music hosting before expanding it

Build one small custom-host experiment using the pinned Flutter version: one surface, one local track, one registered playback plugin and one pause request. Exercise resizing, display scale changes, keyboard focus, hide/show, host shutdown, process failure and audio ownership.

Record a go/no-go decision. A successful standalone Flutter desktop window does not close the embedded-host acceptance criteria. If the custom host is too fragile, present the tradeoff explicitly: retain the embedded-product requirement and budget the native work, or ask the user to approve an architectural alternative. Do not silently substitute an external launcher.

## 5. Make AI useful and assessable

The model picker must report real capabilities. Android currently offers paired-PC/browser workflows; it should not imply the same local inference as Windows. Small local models should first earn trust on extraction, short explanations and constrained revisions. More demanding tasks can offer an optional stronger provider only with a clear context disclosure and appropriate access.

Separate three questions: did retrieval find the needed material, did the model answer faithfully, and can the person verify it? Improvements in one do not establish the others.

Use a small evaluation collection before adding model complexity: at least 30 representative questions covering exact facts, paraphrases, comparison, conflicting sources, missing evidence, OCR errors, long documents and the user's chosen languages. Store expected supporting passages and acceptable abstentions. Compare proposed chunking/ranking against the current implementation.

Improve paragraph-aware chunking and context assembly first. For larger libraries, evaluate SQLite full-text indexing and ranking; check the capabilities of each packaged SQLite/SQLCipher build before depending on FTS5. Add embeddings only when measured retrieval gaps justify their memory, model, storage and migration cost. [SQLite FTS5 documentation](https://www.sqlite.org/fts5.html)

Retain source IDs/versions and evidence per message, distinguish quote from generated interpretation, and show when only selected excerpts were reviewed. For whole-document summaries, implement a section-aware process with recorded coverage instead of relabeling the existing four-excerpt result. A valid citation number proves neither that the quotation supports the claim nor that the model read the entire source.

Treat imported text as evidence, not executable instructions. Preserve the current preview/apply approach to file actions, keep cloud context review explicit, and review each native bridge's allowed operations. Tauri's capabilities model constrains frontend access but does not remove the need to validate custom command inputs. [Tauri capabilities](https://v2.tauri.app/security/capabilities/)

## 6. Data confidence and cross-device continuity

Show protection by data category: conversation text, extracted documents, originals, audio, caches and exported backups. A single “encrypted” badge cannot describe the present mixed coverage. Read the actual active storage mode when displaying health.

Create a backup manifest that lists included items, exclusions, counts and schema version. Add a restore preview and validate a backup in an isolated test area before presenting it as usable. Test the full chain: export, close, restore as new copies, inspect text/annotations/pages, and confirm that originals remain untouched. Correct the page-metadata omission early.

For device continuity, retain the existing conservative conflict-copy behavior until a better merge is proven. Give people a useful conflict view and retry states. Separate successful sync from backup availability. For the first polished version, deliberate, reliable transfer is more valuable than unproven automatic merging of every data type.

Design caches as replaceable and distinguish them from irreplaceable originals, drafts, annotations and editing recipes. Do not raise file limits just because more memory is available on the development machine.

## 7. Prioritized engineering backlog

Size means relative scope, not a delivery promise. Suggested ownership areas are roles for the two collaborators to allocate together.

| ID | Priority / size | Deliverable | Completion evidence |
| --- | --- | --- | --- |
| AF-01 | First / small | Safe AI insertion on Windows, shared behavior for history replies. | Ask after editing a draft: draft remains intact; explicit replacement supports Undo. |
| AF-02 | First / small | Preserve Android source pages through restore. | Round trip retains page numbers, text and OCR flags; legacy backups still load; malformed records fail safely. |
| AF-03 | First / medium | Evidence attached to each saved message. | Two answers with different source sets survive reopen/restore with correct evidence. |
| AF-04 | First / medium | Build provenance and a shared development baseline. | Both computers build/check the same commit; artifact manifests identify source and dependency versions. |
| AF-05 | First / medium | Android hardware acceptance run. | Install/startup, lock screen, audio handoffs, interruptions, permissions and process recreation documented per device. |
| AF-06 | First / medium | Windows Flutter host feasibility experiment. | Written go/no-go backed by embedding, focus, lifecycle and playback results. |
| AF-07 | Next / medium | Job-scoped busy state and revision-safe results. | Writing stays usable during AI; late/cancelled results cannot affect another project or overwrite new edits. |
| AF-08 | Next / medium | Stable source IDs and quotation anchors. | Renaming a file does not break a quote; changed content is detected; page navigation works where supported. |
| AF-09 | Next / medium | MediaStore discovery and scan UI. | Denied/granted/revoked permission, cancellation, duplicates, missing tracks and bounded large-library scan covered. |
| AF-10 | Next / medium | Unified audio ownership including TTS. | No unwanted overlapping output through every supported owner transition and interruption scenario. |
| AF-11 | Next / medium | Retrieval evaluation and context improvements. | Baseline/candidate comparison on expected evidence, faithful answers and abstentions; device memory measured. |
| AF-12 | Next / medium | Reading-to-writing workspace. | Five trial users complete the document journey without coaching; revise friction from observations. |
| AF-13 | Next / medium | Trustworthy backup/protection interface. | Accurate inclusion manifest, actual protection status, isolated restore and conflict recovery demonstrated. |
| AF-14 | Later / medium | Audio Studio project/recipe persistence and export jobs. | Original remains intact; recipe reopens; cancellation and outputs verified with real recordings. |
| AF-15 | Next / small | Consistent branding, version, capabilities and error states. | No stale hardcoded release label; offline/missing-service states give an appropriate next action. |
| AF-16 | Next / medium | Accessibility and mobile input pass. | Narrator/TalkBack, keyboard, text scaling, focus, touch targets and keyboard overlap checked on rendered builds. |
| AF-17 | Release gate / large | Windows installer and production Android signing path. | Fresh install, original-identity upgrade and backed-up data preservation demonstrated. Original Android key access remains unresolved. |

Dependencies: AF-04 enables shared work; AF-01/02 can proceed independently. AF-03 and AF-08 define provenance before broad retrieval expansion. AF-07 enables safe concurrent work. AF-06 is a decision gate for Windows embedded music. AF-05 and AF-10 validate audio integration. AF-17 requires the relevant platform work and signing access.

## 8. Roadmap by acceptance gate

**Gate A — dependable checkpoint:** shared baseline, safe drafts, fixed restore metadata, saved evidence, Android hardware findings, and a Windows embedding decision. Preserve the current checkpoint separately.

**Gate B — coherent daily use:** responsive jobs, anchored quotations, useful scanning, coordinated audio, honest capabilities, and all three complete journeys: document-to-writing, everyday listening, and safe recording improvement. Run small observed trials for each and fix the repeated obstacles.

**Gate C — portable and recoverable:** verified backup/restore, clear conflicts and protection coverage, measured performance on the target laptop/phones, accessibility checks and native packaging.

**Gate D — expansion:** improve original-layout reading, recording/transcription, larger libraries or additional AI providers according to demonstrated demand. Revisit advanced graph presentation, automated sync and larger processing limits only with a clear benefit and acceptance evidence.

These gates are intentionally not dates. Device access, the original signing key, clean-machine build reproduction and Windows host feasibility determine the schedule.

## 9. Proposed quality measures

All figures here are proposed engineering budgets or trial goals, not current measured results or guarantees. Collect a baseline before tightening them.

| Measure | Proposed target / method |
| --- | --- |
| Draft integrity | Zero unintended draft replacement in the scripted journey suite; every accepted replacement reversible. |
| Restore fidelity | All supported fields round-trip in fixtures; excluded media/originals explicitly listed. |
| Interaction response | Visible feedback within 100 ms for ordinary controls; expensive work moved off the UI path where possible. |
| Existing-project opening | Initial goal: usable within 2 seconds on nominated reference hardware, without waiting for model load; measure cold/warm separately. |
| Autosave | Initial goal: save within 1 second after typing stops under normal conditions; save failures remain visible. Crash tests document the actual unsaved window. |
| Cancellation | Acknowledge within 250 ms; separately measure actual worker termination. Never report a cancelled result as applied. |
| Retrieval | At least 90% expected-evidence recall on the initial curated factual set before claiming broad reliability; report set size and failures. |
| Citation quality | Human-check claim support and exact source links on the same set; valid numbering alone does not count. |
| Audio | Zero unintended overlap or host exits in the transition suite; measure lock-screen/background stability and battery on hardware. |
| Usability | Initial goal: 4 of 5 trial users complete each chosen core journey without coaching; qualitative trial, not a statistical market claim. |
| Resource use | Record peak memory, time-to-first-answer, import time, scan throughput and playback interruptions on the actual 8 GB laptop and target phones before choosing limits. |

Use synthetic or consented test material, local diagnostic exports and reproducible fixtures. A cloud analytics system is not needed to begin learning.

## 10. Collaborating without losing the thread

Use GitHub Issues/Projects for development coordination first, while keeping the app's personal Home dashboard focused on the app user. GitHub's project guidance supports linked issues/PRs, customized views and a single source of truth. An in-app GitHub integration remains a separate product decision. [GitHub Projects guidance](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/best-practices-for-projects)

Each issue should contain a user-visible problem, scope, dependencies, owner, acceptance fixture and attached result. Distinguish Source ready, Build passed, Device verified and Released. These represent different evidence and should never collapse into one “Done” label.

Possible work split: one collaborator on shared experience/data/provenance, the other on native playback/builds/device acceptance, with cross-review at schema and bridge boundaries. Agree the roles together. Limit work in progress to one substantial issue per person, and integrate a complete journey regularly rather than accumulating disconnected features.

Do not spend the next cycle on a rebrand-only redesign, a full framework rewrite, an in-app project-management system, or more model choices before the data and workflow gaps are addressed. Those options can be reconsidered when the main journeys are dependable and user trials identify the next constraint.

## Review outcome

The best first implementation slice is AF-01 + AF-02 + AF-03: protect drafts, preserve restored source metadata, and keep evidence with answers. Alongside that slice, settle shared builds, Android hardware behavior and Windows embedding feasibility. These are prerequisites for the confirmed balanced product direction. At each milestone, demonstrate reading/writing/AI, Music Hub, and Audio Studio together; improvements in one area alone do not establish a balanced release.

This blueprint is a proposal grounded in available source and current documentation. It does not supersede confirmed user choices or change the recorded release status. Its issue IDs are local planning references; no GitHub issues, boards or assignments were created.
