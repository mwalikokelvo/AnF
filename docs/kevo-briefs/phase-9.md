# Phase 9 brief: ThingsBook integration & cross-device voice coordination

Version 0.8.x. Each step is one pull request.

Why: The master plan (`docs/KEVO-PLAN.md`, "8. Android, then ThingsBook") specifies extending voice coordination to ThingsBook devices and cross-device sync. ThingsBook records and companion devices exchange voice memos, daily briefing summaries, and action reminders across the user's personal hardware fleet. In accordance with `docs/contracts/vault-v1.md` and `docs/contracts/vault-bridge-v1.md`, AnF maintains strict architectural boundaries: hosts do not point at `_core` (the internal ThingsBook crate), but instead interface via documented, versioned wire protocols (`thingsbook-voice-v1`).

Phase 9 is done when:
- The `thingsbook-voice-v1` protocol contract is defined and documented.
- Voice memos, action triggers, and executive briefings can be packaged into portable, encrypted exchange payloads.
- Cross-device sync transports voice artifacts across PC, Android, and ThingsBook nodes over secure local transport.
- Offline-first guarantees are preserved: failure of any ThingsBook node leaves local notes and voice caches intact.
- Comprehensive automated verification tests assert zero memory corruption, strict contract adherence, and full test suite passes.

---

## 9.1 ThingsBook Voice Contract & Serialization Specs

In `docs/contracts/thingsbook-voice-v1.md` and `windows/src/workspace/jarvis/thingsbook-voice.ts`:
- Define schema for voice notes, audio snippets, and cross-device briefings.
- Implement lossless serialization/deserialization with schema validation.
- Adhere strictly to AnF isolation rules (zero dependency on unverified internal crates).

## 9.2 Cross-Device Voice Artifact Packaging & Exchange

In `windows/src/workspace/jarvis/thingsbook-voice.ts` and `android/web/sync.ts`:
- Support exporting and importing voice packages (`.anfvoice` / encrypted pack) between AnF and ThingsBook endpoints.
- Synchronize active daily briefings and voice reminders across paired devices.

## 9.3 Conflict Resolution & Offline Fault Tolerance

In `windows/src/workspace/jarvis/thingsbook-voice.ts`:
- Implement deterministic last-write-wins with merge preservation for voice transcripts.
- Ensure that network partition or missing ThingsBook device never blocks PC or phone Kevo.

## 9.4 Automated Verification & Compliance Suite

In `windows/tests/kevo-thingsbook-voice.test.ts`:
- Unit tests verifying contract compliance, serialization round-trips, encryption integrity, and partition recovery.
