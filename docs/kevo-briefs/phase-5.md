# Phase 5 brief: Verified actions (each action checks its result; never "done" when it failed)

Version 0.4.x. Built and merged on CI gates alone per `docs/KEVO-PLAN.md` (Phases 3, 4 and 5 are merged consecutively, and one PC test after Phase 5 covers all three). Each step is one pull request.

Why: An assistant that claims an action succeeded when it actually failed destroys trust immediately. Previously, actions like `open_app`, `open_site`, `take_note`, or `music_play` would immediately speak "Opening ...", "Note saved", or "Playing ..." before confirming whether the underlying desktop application launched, the note file was written, or the audio stream started. If the requested app wasn't installed, the path didn't exist, or the media player was empty, Kevo still claimed success or gave silent failures.

Phase 5 is done when:
- Every action verifies its outcome after execution and reports honest status.
- Kevo never says "Done", "Opening", or "Saved" if an action failed; the exact failure reason is spoken clearly and logged.
- Failed actions include structured error details and root causes (e.g. app not found, vault locked, network error, empty query).
- Command desk HUD displays real-time action verification badges (`verified`, `failed`, `running`).
- Full automated test suite covers action success verification and failure reporting across all core actions.

---

## 5.1 Verification Protocol & Execution Result Schema

Extend `KevoActionExecutionResult` in `windows/src/workspace/jarvis/voice/kevo-actions.ts`:
- `status: 'success' | 'failure' | 'unverified'`
- `verified: boolean`
- `error?: string`
- `reason?: string`
- `verificationDetails?: string`

Update the action dispatcher to enforce post-execution verification:
- Action handlers return verification metadata.
- Pre-execution validation catches missing arguments or invalid inputs before running.
- Post-execution checks verify that the side-effect actually occurred (file written, window opened, store updated).
- Disallow optimistic "Opening..." speech replies when verification fails.

## 5.2 Concrete Action Verifiers

Implement real post-execution verification for all core Kevo actions:
- `open_app`: Verify process or window existence after launch. If launch fails or app is missing, fail honestly with "I could not find or launch [app], sir."
- `open_site`: Validate URL syntax, ensure browser opened URL, and verify URL reachability if applicable.
- `take_note`: Check that note was persisted to vault with non-zero size, return note title/path verification.
- `search_notes`: Verify vault search query executed and report honest count or "No matching notes found".
- `remember_fact`: Confirm fact is returned in `listFacts()` post-write.
- `forget_fact`: Confirm fact was located and deleted; report if no matching fact existed.
- `create_reminder`: Confirm reminder exists in `listReminders()` with valid `trigger_at`.
- `cancel_reminder`: Confirm reminder ID or query matched and was deleted; report if not found.
- `music_play` / `music_pause` / `music_next`: Query audio player state (`playing`, `paused`, `track`) to verify playback state transitioned.

## 5.3 Honest Spoken Feedback & Failure Diagnosis

Update speech reply generation across all actions and fast paths:
- Replace presumptive speech ("Opening Spotify, sir") with verified speech ("Spotify is open, sir", or on failure: "I could not open Spotify because the application was not found on your system").
- Clear failure taxonomy:
  - `NOT_FOUND`: App, note, or reminder does not exist.
  - `INVALID_ARGUMENT`: Missing required arguments (e.g. note content or reminder time).
  - `EXECUTION_FAILED`: Runtime exception or OS process error.
  - `NO_MATCH`: Search query returned zero results.
- Spoken responses remain concise (< 2 sentences) and professional.

## 5.4 Command Desk Verification Status & Badges

In `windows/src/workspace/jarvis/jarvis-command-desk.ts`:
- Update the action activity feed / HUD to show verification badges:
  - Green checkmark + "Verified" for successful actions.
  - Red cross + "Failed: [reason]" for failed actions.
- Display action execution history with status and latency.

## 5.5 Comprehensive Action Verification Test Suite

- Add unit and integration tests in `windows/tests/kevo-verification.test.ts` testing every action:
  - Success path: asserts `status === 'success'`, `verified === true`, accurate speech.
  - Failure path: simulates missing apps, invalid URLs, file write failures, missing reminders, empty searches; asserts `status === 'failure'`, `verified === false`, honest error speech.
- Ensure phrase evaluation and release check scripts pass with 100% compliance.
