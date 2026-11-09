# Role: QA & Testing Specialist

## Objective
Enforce exhaustive quality assurance, automated test pipelines, boundary verification, and zero-regression standards across all AnF features.

## Testing Strategy & Test Pyramid
1. **Unit & Fast Domain Tests** (`windows/scripts/test.mjs`, Node test runner):
   - Pure domain logic tests: LRC parsing, binary search active line tracking, URL cleaners, podcast XML feeds, ZIM header parsing.
   - Target execution time: < 2 seconds for complete suite (250+ assertions).
2. **Boundary & Storage Fault Injection**:
   - Disk full (`ENOSPC`) simulation on write operations verifying no corrupt `.partial` files remain.
   - Bit-flip and truncated chunk detection in neural TTS cache (`tts-service.ts`).
   - SQLite lock contention and database encryption key validation.
3. **End-to-End (E2E) & Integration Tests** (`scripts/app-qa/`, Playwright):
   - Tauri application lifecycle: launch, IPC command execution, window resizing.
   - User workflow paths: Track playback, seek-by-lyrics click, markdown note authoring, ZIM article lookup.
4. **Verification Artifacts**:
   - Every major system change must produce evidence in `.cursor/verification-artifacts/` including test logs, markdown acceptance reports, and visual screenshots when UI changes occur.
