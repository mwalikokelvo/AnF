# AnF 0.1.28 — local tools, direct music and reading

## Available without API keys

Home now prioritizes recent work and quick capture. A “Local tools & optional connections” shortcut opens eight tool cards. Their main actions operate locally; six online adapters remain under explicitly optional connection drawers.

- Research notebook prepares a source-grounded question for the bundled local model. Source coverage is partial and citations need checking.
- AI chat explicitly selects the offline model. Writing review and book-to-skill preparation remain local workflows.
- Local planner saves a plan to the writing draft or exports a calendar event as an `.ics` file. Dates are entered in the computer’s local time and exported in UTC. Import into a calendar app for alarms; AnF does not schedule background reminders.
- Offline storyboard exports an SVG containing up to eight user-written scene descriptions, or saves them to writing. This is a planning board, not photo/video generation.
- Local workflow recipes append repeatable study, writing and weekly-review checklists to the saved draft. They do not execute unattended jobs.
- Encrypted local backup opens directly, independently of Nextcloud.

The planner uses [iCalendar RFC 5545](https://www.rfc-editor.org/rfc/rfc5545), escaping text and folding UTF-8 lines at 75 octets. SVG text is XML escaped. These exports are ordinary files in the app’s saved-documents folder. Original media and model weights are not backed up by conversation-text exports.

Online Open Notebook, OmniRoute, Muapi, Cal.diy, Nextcloud and n8n remain optional configurable adapters. This release does not bundle those servers or remove their authentication requirements. Existing service credentials are preserved. Local AI needs the included model/runtime; no silent online fallback is used.

## Music

Entering Audio → Music Hub opens embedded Spotube automatically when the native engine is available. Choosing Local library persists as the preferred music source across restarts; Open Spotube switches back. Startup failures fall back to the local library and retain the explicit recovery button. The engine remains the existing embedded Flutter Spotube build; this is not a rewrite of all Spotube screens into AnF. Provider sign-in, network availability and upstream 401 failures still apply. No account data is reset.

## Reader

- Uses actual page boundaries when page text exactly reconstructs the saved source, with OCR labels. Falls back to lossless sections for other source formats.
- Reflows PDF line wraps into paragraphs without altering underlying source text or existing highlight offsets.
- Exact-text document search wraps forward/backward and highlights the result.
- Read aloud follows and highlights the current sentence, moves between pages, saves its source position, and offers installed offline voices and speed controls. Newlines alone no longer split speech into sentences. Play after pausing resumes at the beginning of the current sentence.
- Notes open on demand; appearance controls are collapsed. New reader defaults are 20 px, comfortable spacing and a wider column; saved preferences remain intact.
- Dark title and audio text use the reader theme colors; audio occupies its own layout area, leaving text scrollable. The amber theme is now defined.
- Keyboard focus includes search, audio sliders and summaries, and excludes hidden note controls.

This remains an extracted-text reader. Original PDF page rendering, illustrations, faithful footnote layout and OCR corrections are not included. Text reflow does not repair OCR spelling or reading-order errors.

## Verification

TypeScript and existing release regressions; focused Chromium tests covering real page boundaries, exact annotation anchors, search navigation, read-aloud highlighting with a speech fixture, responsive layout, exported calendar line folding/injection escaping, SVG escaping, checklist persistence through the writing adapter, automatic Spotube entry and remembered local source choice. Native QA verifies actual local file exports and embedded music visibility separately. See local build status for completed package verification.

Completed package checks: all 593 archived files, ZIP CRCs, SHA-256, native SDK identity and final embedded UI assets pass. Real Windows QA also confirmed PDF page search, actual calendar/SVG export bytes, and three offline voices exposed by WebView2. The dedicated reader flow verifies annotations after paragraph boundaries and a 390×500 window. Android shared web assets compile and all 84 appearance views pass; no new APK is delivered.

Windows artifacts: `windows/release/AnF-Windows-0.1.28-setup.exe` and `windows/release/AnF-Windows-0.1.28-portable.zip`. Quit the running tray app before installing. The existing production application identifier and data paths are preserved. Strix remains pending because its CLI and Docker are unavailable; this local build is not a completed security release gate.
