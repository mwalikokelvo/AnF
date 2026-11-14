# Definition of Done

The standing bar every change clears before it counts as done. It's the same for every task. Acceptance criteria answer "did we build *this thing*?"; the Definition of Done answers "is it *finished to our standard*?" A task is done only when both hold.

If the project already defines its own Definition of Done (in `CLAUDE.md`, `CONTRIBUTING.md`, `CONSTRAINTS.md`, or similar), use that one and treat this list as the fallback for anything it doesn't cover.

## Per slice (before ticking the box)

### Correctness
- [ ] The slice's acceptance criteria are met
- [ ] New behaviour is covered by tests that fail without the change and pass with it
- [ ] Existing tests still pass; no new failures beyond the recorded baseline
- [ ] Edge cases and error paths handled, not just the happy path
- [ ] Verified at runtime where it's user-facing, not only compiled or type-checked

### Quality
- [ ] Names and structure reveal intent
- [ ] No duplicated business logic, no dead code, no debug output or commented-out blocks
- [ ] Changes scoped to the slice; no unrelated refactors or formatting
- [ ] Lint, format, and type-check pass

## Per feature (before the final report)

### Integration
- [ ] Works with the rest of the system end to end, not just in isolation
- [ ] Migrations, config/env changes, and feature flags accounted for and documented
- [ ] Existing callers of any changed interface still work

### Documentation
- [ ] User-facing behaviour, new commands, and new settings documented
- [ ] Decisions worth preserving recorded (spec decisions list; ADR if expensive to reverse)
- [ ] Docs describe the current state, not the change history

### Ship-readiness
- [ ] Every verification claim carries a label (tested / compiled / CI-built / installed / smoke-launched, or the project's set), none stronger than what was done
- [ ] Targets this machine can't build were verified in CI (run id recorded), or listed as not verified
- [ ] The app was only ever run against throwaway data, never the user's real data or settings
- [ ] The shared handoff file has a dated entry for this work
- [ ] Security reviewed for any new trust boundary
- [ ] Enough telemetry on new critical paths to tell whether they work
- [ ] Rollback path exists for anything risky
- [ ] Every slice ticked or marked BLOCKED with a reason
- [ ] The full check suite the CI runs passes locally

## Red flags

- "It's done, I just haven't run it" — unverified work isn't done.
- "Tests pass" used as a synonym for done while docs, runtime checks, or regressions were skipped.
- A lower bar applied because the run is autonomous or the change is "small".
- Acceptance criteria treated as the whole bar.
