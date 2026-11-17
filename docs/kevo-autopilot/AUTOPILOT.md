# Kevo autopilot

The owner authorised this on 16 November 2026: the Kevo plan (`docs/KEVO-PLAN.md`) is built, reviewed, merged and released without asking them. A Claude scheduled task runs this runbook every 2 hours. A second scheduled task on the owner's PC collects Kevo's self-test results (see "PC results" below).

Owner decisions on record (16 Nov 2026):
- Merge into `main` when every gate below passes. No owner review needed.
- PC tests run on the owner's Windows PC whenever it is on, without asking.
- Defaults: Kevo's hearing moves onto the PC (Phase 1). RAM and graphics card are read by the self-test. No cloud model. Test audio uses synthetic voices and is kept in the repo. Phase 7 (pack voices) waits for the owner.

## Each run

Do exactly ONE kind of action per run (the first that applies below), finish it, record it, stop. A run must end within about 90 minutes.

0. **Setup.** `git clone --depth 1 https://github.com/mwalikokelvo/anf` and `git fetch --depth 1 origin kevo-autopilot-state`. Read `STATE.md` from that branch. If it says `paused: yes`, the owner has stopped the autopilot: stop without changes. If its `lock` is newer than 100 minutes, another run is working: stop without changes. Otherwise write `lock: <now UTC>` and push the state branch before working.
1. **Read** `CLAUDE.md`, `docs/KEVO-PLAN.md`, `docs/KEVO-MAP.md`, the current phase brief in `docs/kevo-briefs/`, and the newest `HANDOFF.md` entry.
2. **Pick the action**, in this order:
   1. An autopilot pull request (branch `claude/kevo-*`) has a failing check: find the root cause and push a fix. A failure that is also red on `main` is not this PR's: fix it in the same PR if it is small; otherwise open a separate fix pull request (`claude/kevo-fix-main-*`) for it, which then goes through these same steps. The 3-strikes `blocked` rule applies to both.
   2. An autopilot pull request has unresolved review findings (Codex, CodeQL, a subagent): check each against the code. Fix the real ones, with a test. Answer the rest in the thread with what you checked. Resolve what you fixed.
   3. An autopilot pull request passes every merge gate: merge it (merge commit).
   4. A merged build is waiting for its PC test and `pc-results/selftest-<version>.json` has arrived on the state branch: judge it against the brief's "Done when". Pass: mark the round passed and move to the next step or phase. Fail: start a fix round (next item) using the result. A result of `"result": "could_not_start"` (for example Windows Defender blocked the test build) is not a code failure: set `owner_needed` with the reason it gives, send a notification, and do not start a fix round for it.
   5. Start the next step of the current phase: branch `claude/kevo-<phase>-<step>` from `main`, build it as the brief says, run every check in `docs/KEVO-MAP.md` "Checks", bump the version, add a `HANDOFF.md` entry, open the pull request, record it in STATE.
   6. The current phase has no brief yet: write it (docs only, same shape as `phase-0.md`) as its own pull request.
   7. Nothing to do (waiting for CI, a review or the PC): update STATE's `waiting_for` and stop.
3. **Record.** Append one line to STATE's run log (time, action, PR, result; keep the last 60 lines), clear `lock`, push the state branch.

## Merge gates (all of them)

- Every check run on the head commit has finished, and each is success, neutral or skipped. CodeQL reports no new alerts.
- Codex has reviewed the head commit with no unresolved findings. If Codex has not reviewed it 3 hours after the last push, start a fresh subagent with no context from this run to review the diff, and fix what it finds. That review then counts.
- Phases 1 and 2 also need a second fresh-subagent review of the design: does it match the brief, and is anything unsafe?
- `npx tsc --noEmit`, `npm test` (including the phrase list), `node scripts/check-release.mjs` and `npm run build` pass locally. When Rust changed, `cargo test --lib` also passes.
- The version is bumped in `windows/Cargo.toml`, `windows/package.json`, `windows/src-tauri/tauri.conf.json` and the `coucou` and `coucou-hook` entries in `windows/Cargo.lock`. Docs-only pull requests skip this.
- The pull request touches only what its brief step names, plus always-allowed files: `HANDOFF.md`, `docs/KEVO-MAP.md`, `windows/tests/kevo-phrases.json`, the version files above, and (for brief-writing pull requests) `docs/kevo-briefs/`.

## After a merge

Until Phase 0 step 0.3 is merged, `main` has no Windows build of its own: the pull request's green `Windows` run is the build, and there is no PC test. Steps 0.1 to 0.3 are judged by CI alone.

From step 0.3 on, check that the `Windows` workflow on `main` went green and published the test build `kevo-test-v<version>` as a prerelease. From step 0.4 on, also set STATE `pc_test: pending <version> since <time>`.

Phases 3, 4 and 5 are the one exception to "no phase before the previous PC pass": they are built and merged one after another on CI gates alone, and one PC test after Phase 5 covers all three. Phase 6 starts only after that combined test passes.

The owner's installed AnF must itself contain step 0.4 to fetch test builds. So when step 0.4 is merged, send one notification asking the owner to install that build once (link: the installer artifact `AnF-Windows-setup` of the merged pull request's `Windows` run) and to turn on "Run Kevo test builds and Kevo's self-test automatically" in AnF Settings. Set `owner_needed` until the first PC result arrives.

A PC result that has not arrived after 24 hours: send one push notification ("Kevo's PC test is waiting: turn the PC on with the Claude app open, and check that 'Run Kevo test builds and Kevo's self-test automatically' is on in AnF Settings"). Keep doing cloud-only work for the same phase. Never start the next phase without a passed PC test, except Phases 4 and 5 as described above.

## PC results

The scheduled task "Kevo PC results" runs on the owner's PC every 2 hours. It reads `~/AnF-Kevo/` (written by AnF's self-test, Phase 0 step 0.4) and copies any new `selftest-<version>.json` to `pc-results/` on the state branch. It changes nothing else. The repository is public, so only the self-test result goes there, never Kevo's full log (which can hold anything said in the room).

## Stop and escalate

- The same step fails in 3 runs in a row: set STATE `blocked: <step>, <reason>`, send a push notification, and skip that step in later runs until something it depends on changes.
- Before Phase 7: stop building, send a push notification that the owner's voice decision is needed.

## Never

- Push to `main` directly, force-push any branch, or delete branches other than merged `claude/kevo-*` ones.
- Skip, disable or loosen a test or a check to get green.
- Change anything outside the brief: other AnF features, Android (until Phase 8), ThingsBook.
- Spend money: no cloud model, paid API or paid service.
- Store secrets in the repo.
- Install anything on the owner's PC except through AnF's own opt-in test-build setting.

## Notifications

Push a notification only for: a merge plus its test build, a phase passed, a PC test that failed twice, `blocked`, or the owner being needed. Nothing else.
