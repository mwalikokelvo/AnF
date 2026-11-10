# Original User Request

## Initial Request — 2026-10-30T23:46:54Z

Expand the AnF offline-first workspace (Windows & Android) across its architectural capability pillars, focusing on the MKR Music integration on branch feat/mkr-music-integration and implementing pillar enhancements across media, reader, studio, vault, and addon modules as prioritized by the team.

Working directory: C:\Users\mwali\.gemini\antigravity\scratch\AnF
Integrity mode: development

Reference material:
- AntennaPod: Podcast parsing, RSS feeds, and episode playback (https://github.com/AntennaPod/AntennaPod)
- Spotube / Spotify: Streaming audio integration (https://open.spotify.com/, https://github.com/team-spotube/spotube)
- MKR Music: Synced lyrics (LRCLIB) and audio player engine (https://github.com/mkr-infinity/mkr-music)
- Substack: Article reader and publishing workflows (https://substack.com/)
- Kiwix Desktop: Offline knowledge base and ZIM archive reading (https://github.com/kiwix/kiwix-desktop)
- Audacity: Audio Studio wave editing and recording capabilities (https://github.com/audacity/audacity)
- Orion Store: Addon Store / marketplace catalog for extensible offline modules (https://github.com/RookieEnough/Orion-Store)
- DeepSeek-V4.1-Flash / Hugging Face Flint Bucket: Local AI model integration and weight storage (https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017, https://huggingface.co/buckets/mwalikokelvo/flint-bucket, https://huggingface.co/)
- Demo Video: c:\Users\mwali\Videos\Screen Recordings\Screen Recording 2026-10-30 180659.mp4

## Requirements

### R1. Music Hub Audio Player and Synced Lyrics Integration
Implement the MKR Music audio player engine and LRCLIB synchronized lyrics integration in AnF on branch feat/mkr-music-integration, enabling audio playback controls, metadata display, and synchronized scrolling lyric lines.

### R2. Architectural Expansion Pillars
Incorporate architectural expansions into AnF's workspace modules as prioritized by the team based on the reference applications:
- Podcast parsing, RSS feed management, and playback (AntennaPod)
- Streaming audio metadata and playback integration (Spotube / Spotify)
- Article reader and publishing workflows (Substack)
- Offline knowledge base and ZIM archive reading (Kiwix Desktop)
- Audio Studio waveform editing and audio recording (Audacity)
- Addon Store / marketplace catalog for offline modules (Orion Store)
- Local AI model execution and weight management (DeepSeek-V4.1-Flash / Hugging Face Flint Bucket)

### R3. Offline-First Cross-Platform Support
Ensure all integrated features maintain offline-first capabilities for both Windows and Android, preserving local storage and gracefully handling lack of network connectivity.

## Acceptance Criteria

### Audio Player & Lyrics Verification
- [ ] The MKR Music player engine initializes and controls audio playback (play, pause, seek, stop) without unhandled errors.
- [ ] LRCLIB lyrics service retrieves and parses synchronized lyrics, scrolling in sync with playback timestamps.

### Architectural Pillars Verification
- [ ] Each prioritized expansion pillar is implemented as a functional module or component integrated with AnF's existing UI (Home, Music Hub, Audio Studio, Settings/Addon Store).
- [ ] Offline operations complete successfully without requiring active network connectivity.

### Code Quality & Testing
- [ ] The project builds and compiles cleanly for the target platforms without build errors.
- [ ] Automated unit or integration tests for new services and player components execute and pass.


## Follow-up — 2026-10-31T02:48:42Z

User has explicitly approved Option 1: Full Milestone Progression across the entire offline workspace expansion (M1 through M7).

The repository working tree at C:\Users\mwali\.gemini\antigravity\scratch\AnF has been cleanly merged with commit 1a195de and passed all 10 release regression checks.

Please resume execution immediately:
1. Revive the E2E Testing Track: Implement `windows/tests/e2e/test-env.ts` and author Tiers 1-4 tests (target >= 115 tests across the 10 features defined in TEST_INFRA.md).
2. Complete Milestone M1 (Media & Music Hub Integration):
   - MKR Music playback engine state machine, audio queue reconciliation, and playback controls.
   - LRCLIB synchronized lyrics with 7-stage offline cache cascade and karaoke active-line glow.
   - AntennaPod podcast RSS feed parser, episode enclosure downloads, and progress persistence.
   - Spotube streaming audio metadata resolution and offline blob caching.
3. Once M1 passes verification, proceed systematically through M2 (Reader/Publishing Desk), M3 (Vault & Kiwix ZIM Knowledge), M4 (Audacity Audio Studio), M5 (Orion Addon Store & Local AI), and M6 (Offline-first 4-tier storage hierarchy & sync).
4. Send regular milestone progress updates.
