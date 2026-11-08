# Reference: Definition of Done (DoD)

## Verification Gates
Before any task, pull request, or feature branch is marked complete, it must satisfy all of the following requirements:

### 1. Code Compilation & Type Safety
- `npm run typecheck` (or `npx tsc --noEmit`) passes with 0 errors in `windows/` and `android/`.
- `cargo check` and `cargo clippy` pass with 0 errors and 0 warnings in all Rust crates.

### 2. Automated Test Coverage
- `npm test` runs and all unit/domain tests pass (minimum 250+ assertions without regressions).
- Boundary tests for offline behavior and edge cases (e.g. disk full, network timeout) pass cleanly.

### 3. Offline-First Verification
- Feature functions completely in zero-connectivity mode without crashing or hanging UI elements.
- No network requests are made when local caches are valid.

### 4. Verification Artifact Created
- When modifying architectural modules or user-facing interfaces, produce a markdown verification summary in `.cursor/verification-artifacts/<feature-name>.md`.
- Include test execution outputs, boundary edge-case evidence, and screenshots for visual UI changes.
