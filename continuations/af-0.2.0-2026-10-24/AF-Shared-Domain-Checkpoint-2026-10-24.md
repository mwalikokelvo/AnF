# A&F shared-domain migration checkpoint

24 October 2026. Editable source: `build-work/af/work/coucou`. This implements the next repository-unification step from `code.md.txt`, following the user's instruction to continue. The complete architectural remodel remains in progress.

## Completed architectural change

Six platform-independent implementations now live in `shared/domain/`: `answer-evidence.ts`, `reader-data.ts`, `dashboard-data.ts`, `knowledge-data.ts`, `library-data.ts` and `followups.ts`. They preserve the existing evidence snapshot validation, reading positions/highlights/bookmarks, fenced task/habit extraction, knowledge search/tag/graph behavior, document metadata and follow-up rules. Original implementation bytes were copied unchanged and hash-checked. `index.ts` exposes a neutral API.

The six former `windows/src/workspace/` paths now contain compatibility re-exports, with no parallel implementation. Direct imports were updated in Windows `dashboard.ts`, `library.ts`, `main.ts`, `quick-capture.ts`, `reader.ts`, `studio.ts` and `workflows.ts`, and Android `web/main.ts`, `web/project-data.ts` and `web/sync.ts`. Both hosts now consume these domain rules through the neutral boundary. Shared audio code from the prior checkpoint remains intact. This does not merge the native storage engines or replace encrypted files.

Added `windows/dev/shared-domain-entry.ts` and `shared-domain-check.cjs`, registered in `build-work/verify-frontend.ps1`, and updated `shared/README.md`. The architecture test independently bundles the neutral entry and rejects transitive dependencies outside `shared/`; it also checks that every legacy runtime export is the identical shared value. This protects the new boundary against future imports of a platform host.

Exact source inventory and pre-move hashes: `build-work/verification/shared-domain-2026-10-24/migration-inventory.json`.

## Verification and artifacts

All **26 focused suites PASS**, including the new boundary test and existing desktop/mobile workspace, reading, evidence, knowledge, task/capture, sync and audio coverage. Windows strict TypeScript/Vite, native release compilation and NSIS packaging PASS. Android strict TypeScript/interface/debug packaging PASS: 38 tasks, 1 executed / 37 up-to-date. APK signature v2, CRC, ZIP alignment, exact JS/CSS and three-ABI Flutter engine/AOT checks PASS. Windows app payload is x64 PE; installer is unsigned.

| Development artifact | Bytes | SHA256 |
| --- | ---: | --- |
| `build-work/artifacts/AF-0.2.0-Windows-base-development-shared-domain-2026-10-24-setup.exe` | 51447101 | `7dfd8cd9073c8ecbf4abd0f26bfab9eb3ca89709d5462843648e94a7924e7130` |
| `build-work/artifacts/AF-0.2.0-embedded-music-development-shared-domain-2026-10-24.apk` | 191778600 | `6145a10bca8b06494fd11614107f0ead6f9ac354b076ed33fd7e3af1eb06454a` |

The rebuilt Android APK is byte-identical to the prior shared-core artifact; no functional or visual change is claimed from module relocation. Android remains `com.coucou.workspace.dev`, `0.2.0-dev` / 2000, with the same development signer. Prior artifacts are preserved.

Evidence: `build-work/verification/shared-domain-2026-10-24/`. No Rust implementation, native Java/Flutter code, schema, key custody or sync protocol changed. The prior 55 passing native tests / 12 ignored tests remain recorded in the native checkpoint; they were not re-run in this pass. No installation, upgrade, native GUI or Android device acceptance was run. Existing SQLite 32-bit ELF alignment caveat persists. Windows offline-AI runtime/model resources and Windows embedded Spotube are still absent from this base package. This is not a production release or a claim of feature/aesthetic parity.

Source export: `build-work/AF-0.2.0-shared-domain-checkpoint-2026-10-24.zip`. The source ZIP contains no signing keys or installed tool caches; it is distinct from the two installable development packages.

## GitHub reconciliation

Remote `main` was refreshed and remains `5d8c73fe77b8a7e78c1c903145ba12ad264054d6`. Comparison of these six domains found four differences or missing modules; details are in `github-domain-comparison.json`. Main also contains native music adapters, shared design and CI absent from the local export. Its `_core/README.md` describes an unfinished ThingsBook native core and generated bindings that are not evidence of an integrated AnF shared vault. Blindly adopting that core could change encryption/storage behavior, so it was not substituted.

Save this migration in the existing GitHub continuation checkpoint branch without replacing main. The source and GitHub implementation still require deliberate reconciliation. No cloud CI pass, release tag or production publication is claimed from local builds.

Next milestones: versioned platform adapter/storage/audio-job contracts; shared responsive shell and state; tested port of local safeguards into main's native music/CI work; encrypted migration/recovery and paired-device acceptance; model-enabled AI/speech and Windows music integration. Preserve both-platform artifact delivery and record exact Git push results in continuity.
