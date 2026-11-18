# Phase 7 brief: Pack voices & real team (no made-up numbers, owner voice decision)

Version 0.6.x. Each step is one pull request.

Why: An executive companion that invents fictional metrics destroys operational credibility. In early builds, `JarvisExecutive` generated briefings using hardcoded mock numbers ($30,000 MRR, 2,459 new subscribers, 18,740 total subscribers, $1,420 ad spend). The Kevo master plan (`docs/KEVO-PLAN.md`) strictly mandates: "team cards real or removed; owner decides first; no made-up numbers." Kevo must only speak verified data sourced from the local workspace: actual notes in the Vault, real items in the Reading Queue, real pending reminders, and actual media playback state.
Furthermore, Kevo ships with 13 voice profiles and reference audio in `windows/voice-pack/`. Phase 7 establishes clean, offline voice synthesis options and gives the owner transparent control over whether to use local voice pack audio cues or native OS voices.

Phase 7 is done when:
- Executive briefings produce 100% verified, truthful summaries with zero fabricated business metrics.
- Team cards correspond to actual AnF modules (Vault/Knowledge, Reading Library, Reminders/Schedule, System Health) with live counts.
- Voice pack registry provides verified local audio previews and robust fallback to system speech synthesis.
- Kevo settings expose clean options for voice selection and briefing sources.
- Automated evaluation tests verify that all executive outputs contain zero mock figures.

---

## 7.1 Real Workspace Data & Elimination of Fabricated Metrics

In `windows/src/workspace/jarvis/jarvis-executive.ts` and `windows/src/workspace/jarvis/jarvis-command-desk.ts`:
- Completely eliminate hardcoded demo revenue, ad spend, and subscriber numbers.
- If external business telemetry is not configured or available, those cards are omitted entirely rather than filled with fictional placeholders.
- Redefine `ExecutiveBriefing` chunks to represent real local capabilities:
  - **Knowledge & Vault**: Count of notes, recent edits, vault health.
  - **Reading Queue**: Pending articles/EPUBs, reading progress, estimated remaining reading time.
  - **Schedule & Reminders**: Reminders due today, daily briefing items from Phase 4.
  - **System & Audio**: Active playback, volume, disk space or hardware profile.
- Spoken greeting and briefing remain punchy, professional, and completely factual.

## 7.2 Truthful Team Cards & Workspace Telemetry Providers

In `windows/src/workspace/jarvis/jarvis-executive.ts` and `windows/src/workspace/main.ts`:
- Connect briefing generators directly to local workspace stores:
  - Hook into `VaultSearchBridge` or note storage for real note metrics.
  - Hook into `ReadingQueue` for real item counts.
  - Hook into `KevoReminders` for genuine upcoming alarms/timers.
- Render clean summary cards in Command Desk HUD displaying verified badges ("Verified Local Data").

## 7.3 Voice Pack Pipeline & Local Audio Previews

In `windows/src/workspace/jarvis/voice/jarvis-voice-pack.ts` and `windows/src/workspace/jarvis/voice/jarvis-speaker.ts`:
- Verify all 13 voice profiles in `JARVIS_VOICE_PACK`.
- Provide instant audio preview capability for each voice profile via `playVoicePreview(voiceId)`.
- If an MP3 sample is missing from `windows/voice-pack/` or cannot be decoded, fall back gracefully to offline Web Audio chirp or native speech synthesis without breaking or crashing.
- Respect owner choice: default remains `Kevo (Gentle Bass)`.

## 7.4 Settings & Owner Voice Selection Controls

In `windows/src/workspace/jarvis/jarvis-command-desk.ts` and Kevo settings:
- Surface voice pack selector allowing the owner to test and choose their preferred voice.
- Add toggle for "Executive briefing: real workspace data only".
- Include clear indicator of whether natural/neural voices or native system voices are active.

## 7.5 Automated Verification & Integrity Test Suite

In `windows/tests/kevo-executive.test.ts` and `windows/tests/kevo-voice-pack.test.ts`:
- Unit tests verifying that no executive briefing generates hardcoded mock numbers (`$30,000`, `2459`, `18740`).
- Test that missing data sources omit cards cleanly without errors.
- Test that voice pack registry profiles match filenames in `windows/voice-pack/SOURCES.txt`.
- Test voice preview playback and graceful error handling.
