# Kevo map

Where Kevo lives, how to check it, and what Phase 0 taught. Plan and phases: `docs/KEVO-PLAN.md`. History: `HANDOFF.md`.

## Files (all under `windows/`)

| File | What it does |
|---|---|
| `src/workspace/jarvis/jarvis-command-desk.ts` | Wires everything: listener, agent, speaker, orb, Stop button, typed box, timer announcements |
| `src/workspace/jarvis/jarvis-hud.ts` | The orb (state text), the last exchange under it, and the Activity list |
| `src/workspace/jarvis/jarvis-executive.ts` | Morning briefing from all agents, spoken with music ducked |
| `src/workspace/jarvis/voice/jarvis-voice-listener.ts` | Speech recognition, wake word ("Kevo" and misheard forms), joining cut-up phrases, mic errors |
| `src/workspace/jarvis/voice/jarvis-voice-agent.ts` | Decides what a request is: quick answers, timers, apps, sites, music, notes, else the AI |
| `src/workspace/jarvis/voice/jarvis-speaker.ts` | Text to speech, streamed replies, Stop |
| `src/workspace/jarvis/voice/jarvis-voice-pack.ts` | The 13 voices and their speech profiles |
| `src/workspace/jarvis/voice/jarvis-memory.ts` | Last few turns sent to the AI as context |
| `src/workspace/main.ts` | Gives Kevo its actions (`openApp`, `openUrl`, `searchWeb`, `askAI`, …) via Tauri `invoke` |
| `src-tauri/src/kevo_system.rs` | Windows side: find and open Start Menu apps (`best_app_match`), system actions |
| `src-tauri/src/kevo_ears.rs` | Phase 1 hearing on the PC (sherpa-onnx, feature `kevo-ears`, on in `npm run pack` and CI tests); pinned models (VAD, KWS, streaming transcription) fetched through `model_download`; test-only until step 1.3 |
| `src-tauri/src/workspace_commands.rs` | `kevo_ask` / `kevo_cancel`: the local AI call and its system prompt (`KEVO_SYSTEM`) |
| `tests/jarvis-*.test.ts`, `tests/kevo-*.test.ts` | Node tests; `kevo-phase0-session2.test.ts` holds the requests from the owner's recording |

## Checks

```
node scripts/check-release.mjs                      # repo root, 12 release checks incl. "Kevo voice checks"
cd windows && npm ci && npx tsc --noEmit && npm test
cd windows && npm run build                         # before cargo test (needs ../dist)
cd windows/src-tauri && cargo test --lib            # Linux: see BUILDER-RUNBOOK.md for apt packages and placeholders
```

`#[cfg(windows)]` code only compiles in the GitHub `Windows` workflow. Nothing here replaces the owner's run on the installed app with a real microphone.

## Lessons from Phase 0

Session 1 (0.1.53 → fixed in 0.1.54):
- People pause mid-request; the recogniser cuts it up. Wait for quiet (`settleMs`) before acting.
- Answer the name, greetings and "what can you do" locally. Sending them to the small model gives odd replies.
- Keep the AI prompt plain. Saying the reply is "spoken" made the model talk about voices.
- Recognition errors must say what to do, not show a code.

Session 2 (0.1.54 → fixed in 0.1.55):
- People talk politely and chain things: "In the meantime, can you open Brave and play YouTube?" Strip the lead-in and split on "and" only where a new command starts.
- People follow up: "open browser", then "Brave browser", then "open it". Remember the last subject and the last miss.
- "Opening Brave." is not proof Brave opened. Windows can keep the window behind AnF. Phase 3 (verified actions) should check that the window appeared.
- Never drop something Kevo has to say (a timer) because it is busy: queue it.
- When the mic can't work, the button and orb must say so, not "Say Kevo".
- The test report is written by Gemini from the video. Check its version label and odd lines against the video before building on them.

Session 3 (0.1.55 → fixed in 0.1.56):
- Opening a browser and a page in the same breath races: open only the page.
- "on YouTube" means YouTube, not Music Hub.
- Questions about Kevo itself (its tasks, voices, microphone) are answered locally; the small model does not know them and gets stuck repeating itself.
- People keep talking past the follow-up window, and the recogniser sometimes never confirms words. Extend the window while speech is heard; use unconfirmed words after a pause.
- A preview cut at 1 s sounds broken. Play the whole recording or none.

## Rules

Smallest complete change. Every fixed request gets a test with the owner's own words. Branch, PR, green checks; never push to `main`. Add your result to `HANDOFF.md`.
