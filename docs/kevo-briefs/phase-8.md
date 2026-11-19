# Phase 8 brief: Android desk companion & Kevo on the phone

Version 0.7.x. Each step is one pull request.

Why: An executive companion should not be tethered to a desktop display when working across a physical desk. The Kevo master plan (`docs/KEVO-PLAN.md`, "Phase 8: Android, then ThingsBook") and the HUD track (`docs/kevo-briefs/hud.md`, "H.7 Desk companion") specify turning an Android phone into a dedicated desk companion for Kevo on the PC over the existing local Wi-Fi pairing. The phone serves as a physical companion dock displaying Kevo's animated eyes/orb, speech waveform, live state border, approval card prompts, and a tactile hold-to-talk microphone trigger. Additionally, Kevo on Android must support standalone voice interaction and pass Phase 0 operational integrity checks.

Phase 8 is done when:
- An Android desk companion view exists in `android/web/` accessible from the navigation / bottom bar.
- The companion pairs with PC Kevo over local Wi-Fi, streaming states (`Off`, `Idle`, `Listening`, `Thinking`, `Speaking`, `Alert`) within 150 ms.
- Audio speech loudness drives an animated waveform/pulse on the phone during speech playback.
- Approval cards triggered on the PC can be approved or denied directly from the Android phone screen.
- Tactile hold-to-talk on the phone transmits spoken audio or voice commands directly to PC Kevo.
- Standalone Android voice interaction passes Phase 0 checks without cloud dependencies.
- Automated tests verify state synchronization, approval handling, and clean disconnection fallbacks.

---

## 8.1 Android Desk Companion View & UI Components

In `android/web/desk-companion.ts`, `android/web/main.ts`, and `android/web/style.css`:
- Implement `createDeskCompanionView(options)`:
  - Full-screen or docked desk display mode optimized for landscape and portrait desk stands.
  - Render Kevo's visual identity: animated glowing orb/eyes with CSS transform states matching PC Kevo (`jarvis-hud.ts`).
  - Animated speech level waveform driven by loudness levels (0–1).
  - Status banner with plain-text status line ("Listening", "Thinking", "Opening Brave", "Idle").
  - Tactile "Hold to talk" button providing haptic feedback on touch start/end (`window.AnFAndroid?.haptic?.()`).
  - "Exit companion" button returning to standard AnF workspace view.
- Expose "Desk companion" launcher in Android's navigation bar or Quick Tools.

## 8.2 Wi-Fi State Bus & Pairing RPC for Kevo

In `windows/src/workspace/jarvis/kevo-link-bus.ts`, `windows/src-tauri/src/link.rs`, and `android/web/sync.ts`:
- Extend existing AnF local Wi-Fi pairing protocol to support Kevo companion telemetry:
  - Route `/v1/kevo/state`: Returns current state (`state`, `line`, `badge`, `level`).
  - Route `/v1/kevo/command`: Sends voice text or commands from Android to PC Kevo.
  - Push/poll event stream for low-latency state mirroring (< 150 ms latency).
- Fallback gracefully when Wi-Fi is unconfigured or disconnected, showing honest connection status ("Waiting for PC connection").

## 8.3 Remote Approval Cards on Android

In `android/web/desk-companion.ts` and `windows/src/workspace/jarvis/jarvis-command-desk.ts`:
- Mirror pending approval cards (from HUD step H.4) onto the Android desk companion screen.
- Render card with action description, summary, and clear "Approve" / "Deny" buttons.
- Tapping "Approve" or "Deny" sends response over `/v1/kevo/approve` immediately settling the PC approval gate.
- Auto-dismiss when timeout occurs on PC or when approval is resolved by voice.

## 8.4 Standalone Voice on Android

In `android/web/desk-companion.ts` and `android/web/main.ts`:
- Support local voice mode using Android's native speech recognition and synthesis (`window.AnFAndroid?.speak`, native recognition) when disconnected from PC.
- Honor offline-first and privacy boundaries: no unencrypted audio transmitted outside local network.

## 8.5 Automated Verification & Desk Companion Test Suite

In `windows/tests/kevo-desk-companion.test.ts` and `android/web/` tests:
- Test desk companion view instantiation and state rendering (`data-state="listening"`, `thinking`, `speaking`, `idle`).
- Test waveform level clamping (0 to 1).
- Test remote approval RPC serialization and timeout handling.
- Test graceful handling of Wi-Fi drops and reconnection.
