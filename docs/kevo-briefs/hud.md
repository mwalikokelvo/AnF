# HUD track brief: Kevo float, approval card, summary card

Owner's decision (17 Nov 2026): the float HUD from the master engineering handoff runs as a **parallel track** next to the phases in `docs/KEVO-PLAN.md`. It shows Kevo's state and asks for approval; it never hears, decides or acts by itself, so it does not wait for Phases 1 to 5. Each step is one pull request, same gates as every Kevo pull request (`docs/kevo-autopilot/AUTOPILOT.md`). Version: bumped at merge like the rest.

Inspired by Coucou's notch island and Panda Automate's float: a tiny pill that grows only when there is something to see.

The HUD track is done when, on the owner's PC, the self-test shows: the float follows every state change within 100 ms (from Kevo's log), the float uses 0 % CPU averaged over 60 s while Kevo is idle, an approval is answered by click and by a spoken "yes" and "cancel", and a dropped Markdown file is found by vault search afterwards.

## Rules for this track

- **Push, not polling** (`AGENTS.md` rule 5): the float changes only when an event arrives. No `setInterval`, no animation-frame loops that read state. One `setTimeout` to fold the pill after 4 s of quiet is allowed. CSS animations stop (`animation-play-state: paused`) when Kevo is idle or asleep, and the window is hidden when Kevo is off.
- **Zero tokens for looks**: the model is never asked what the HUD should show. State comes from code.
- **Do not cover the island**: AnF's island (`island` window, top centre, 240 px wide) stays where it is. The float sits just below it at top centre, can be dragged elsewhere, and remembers where it was put.
- **Shipped views stay as they are**: the orb in `jarvis-hud.ts` and the companion window are not restyled. The float reuses the orb's colours and its `KevoState` names.
- A setting "Show Kevo float" in Kevo's settings, on by default, turns the whole window off.

## Who builds which step

| Step | Owner label | Depends on |
|---|---|---|
| H.1 State bus | `team:codex` | — |
| H.2 Micro-pill window | `team:jules` (Rust window builder may be done by Codex in the same issue if Jules asks) | H.1 |
| H.3 Telemetry pill | `team:jules` | H.2 |
| H.4 Approval card | `team:codex` (Rust) then `team:jules` (card) as two issues | H.2 |
| H.5 Drop files | `team:any` | H.2 |
| H.6 Summary card | `team:jules` | H.3 |
| H.7 Desk companion | written with Phase 8 | Phase 8 brief |
| H.8 Self-test | `team:claude` | H.3, H.4, H.5, and step 0.4 of Phase 0 |

## H.1 State bus (Rust)

A Rust enum `KevoHudState { Off, Idle, Listening, Thinking, Speaking, Alert, Sleeping }` and one event `kevo://state` with `{state, line, badge, level}`: `line` is the current step in plain words ("Opening Brave"), `badge` the engine and time ("Local model · 1.2 s", "Offline"), `level` the speech loudness 0–1 (sent at most 20 times a second, only while speaking).

Until Phase 1 moves hearing into Rust, the main window reports changes with a command `kevo_hud_set` (called from the place in `jarvis-command-desk.ts` that already computes `kevoState()`), and Rust re-emits the event only when the value changed. `kevo_ask` sets `badge` from its own timing. When Phase 1's `KevoEarsListener` lands, Rust emits wake/listening directly and the command is used only for what the web view still owns.

Tests: Rust unit tests for change-only emission and the 20-per-second cap; a Node test that `kevoState()` changes call `kevo_hud_set` exactly once each.

## H.2 Micro-pill window

A second window `kevo-float` built in Rust like `companion.rs` (`WebviewWindowBuilder`: no decorations, transparent, no shadow, always on top, skip taskbar, not focusable) with its own capability file allowing only dragging. Page `kevo-float.html`, TypeScript in `src/kevo-float/`.

State 1, 48 × 28 px: Kevo's status dot and a small level pulse driven by `level`. On Android the same view docks into the floating bottom pill (Phase 8).

Tests: a browser-fixture test that each `kevo://state` value gives the right `data-state`, that nothing runs between events (no timers left after an idle event), and that the pill folds 4 s after the last event.

## H.3 Telemetry pill

State 2, 420 × 110 px: grows on wake, on hover, and while an action runs. Left: Kevo's avatar (the orb drawn small, same CSS). Right: two lines of `line` text, newest at the bottom, and the `badge`. Folds back to State 1 after 4 s of quiet. Resizing goes through one Rust command with the two fixed sizes, like `companion_compact`.

Tests: browser fixture for grow/fold and for long text (two lines, ellipsis, never wider than the pill).

## H.4 Approval card

State 3: a card slides out next to the pill when an action needs approval. Rust keeps the pending request: event `kevo://approve` `{id, action, summary}`, answer command `kevo_hud_answer(id, approved)`. Approve and Deny buttons; while the card is open, Kevo also accepts a spoken "yes" or "cancel" (through the existing listener). No answer in 60 s means **deny**. One card at a time; a second request waits.

Which actions ask: sending a file to another device, deleting anything, running a script. None of today's Kevo actions does these, so this step adds the gate and its tests; Phase 5 (verified actions) and later actions must go through it.

Tests: Rust tests for timeout-is-deny, one-at-a-time and unknown-id; Node tests that "yes"/"cancel" answer only while a card is open.

## H.5 Drop files on the pill

`tauri://drag-drop` on the float window. Markdown and text files go into the vault through the existing project import; EPUB and audio files go to whichever existing import or transcription command takes them; anything else, or a type with no such command yet, gets a plain "I can't take that file yet" on the pill. Files are copied, never moved. No new parser in this step.

Tests: a Rust test that the drop handler only accepts paths from the drop event and refuses folders; a browser fixture for each message.

## H.6 Summary card

When Kevo finishes a longer answer or background search while the main window is hidden, a compact card under the pill shows three lines and expands on click to the full text, with a Close button. Kevo never moves the mouse pointer. (Pointing at things on screen would need reading other apps' windows; it is left out until the owner asks for it.)

Tests: browser fixture for three-line clamp, expand and close.

## H.7 Desk companion (Android)

Starts with Phase 8. A toggle on AnF Android's floating bottom pill turns the phone into a desk display for Kevo on the PC, over the existing local Wi-Fi pairing: eyes, level waveform, hold-to-talk, status border, approval card. Written in detail with the Phase 8 brief.

## H.8 Self-test on the PC

The self-test gains the "Done when" checks above: state-change delay from the log, 60 s idle CPU of the float window, an approval answered by click and by the synthetic "yes"/"cancel" clips, and a dropped Markdown file found by search. Results go into `selftest-<version>.json` as numbers only.
