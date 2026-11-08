# Buildup status — 2026-11-07

One page every builder should read before touching AnF. Keep it current; append, don't rewrite history.

## Where `main` is

- `main` = `229479e` (merge of #109). Green on `Windows frontend gates`, macOS `Build`, CodeQL, contracts, Linux and Windows Rust builds.
- Merged this session: #103 build repair + CI gate, #104 overnight stack integration, #105 Music Hub local-first rebuild, #106 Internet Archive source, #107 2 MB writing ceiling, #108 copy cleanup, #109 Subsonic/Navidrome source.
- Open: none of ours. Superseded PRs #96–#102 closed; #95 (neural TTS) remains open and should stay closed until a real provider exists.

## What the app is now

- **Music Hub**: local library, audiobooks, RSS podcasts, playlists, favorites, Music Flow, EQ, sleep timer, speed; **Archive** tab streaming LibriVox/IA; **Subsonic** tab for the user's own Navidrome, search + stream through Rust.
- **Reader/Writing**: 2 MB draft ceiling across editor, save and vault (older builds refuse >200 KB — one-way upgrade).
- **Build protection**: `Windows frontend gates` runs typecheck, unit, e2e and release checks on every push to `main`. It exists because the sort automation twice pushed a broken `library.ts` and once a `PLACEHOLDER` `native-music-player.ts`.

## Environment facts (this PC)

- Windows, **no admin**, no Docker Desktop, no WSL distro by default.
- Docker **26.1.5 + Compose v2.27.0** now runs in an imported Alpine WSL2 distro: `wsl -d AnFDocker -u root`. Ports published there are reachable from Windows `localhost` (verified).
- **7.7 GB RAM total**, WSL gets ~3.8 GB. Self-hosted suites (Chatwoot, Cal.com, OpenProject, AppFlowy) run **one at a time**, not together. Disk: 224 GB free.
- Node 26, Python 3.15, Rust 1.99, gh authenticated as the owner.

## Agent tooling

- Global skills live in `C:\Users\mwali\.agents\skills` (283+): Superpowers, gamedev 77 + router, caveman, ponytail, jcode, voicestudio, openwhispr, rea, brag, agent-reach, mirofish, browser-use-jev, claude-code-security-review, `anthropic-skill-creator`.
- **REA policy: never skip REA** for an app or feature investigation, even with source available. `rea` CLI 6.8.0 is on PATH; MCP is not configured in this profile, so use the CLI fallback. The rule lives in `reverse-engineer-anything/SKILL.md` and must be preserved on updates.
- No MCP client in this profile: Context7/DigitalOcean MCP cannot be called yet.
- No pnpm; npm only.

## Rules that keep breaking us

1. **Never commit `PLACEHOLDER` or generated files from a template.** The automation did this to `library.ts` (regex `\\/`) and `native-music-player.ts`. Use `\/` in the URL-strip regex, and never replace a real module with a stub.
2. Authors work on branches; `main` gets plain merge commits. No force-push.
3. Verify with `cd windows && npx tsc --noEmit && npm test && npm run test:e2e && node ../scripts/check-release.mjs`.
4. The Windows frontend gates are the guard; keep them green.
5. **Never skip REA.** Mandatory across all builders for feature, app, or protocol investigations. Evidence from ea must ground all designs.

## Completed in this session (2026-11-08)

1. **Spotify-Class Music Player Capabilities**:
   - **Continuous Seamless Crossfade**: Replaced silent pause transitions with smooth volume crossfade stepping (`step(1, true)`) when remaining duration reaches configured fade seconds (0s to 12s).
   - **Volume Normalization (Loudness Equalization)**: Studio-grade `DynamicsCompressorNode` integrated in `AudioDspEngine` with toggleable leveling in EQ dialog and full player.
   - **Audio Spectrum FFT Analyser**: Real-time Web Audio `AnalyserNode` frequency inspection exposed via `getFrequencyData()` in `AudioDspEngine`.
   - **Unified Omni-Search**: `searchMultiSource` connects Local, Audius (320kbps MP3s), Subsonic/Navidrome (self-hosted cloud), YouTube streams, and Internet Archive audiobooks in a single query.
   - **Listening History Tab**: Dedicated "History" view in Music Hub displaying played tracks chronologically with one-click replay and history clearing.
   - **Infinite Auto-Play & Track Radio**: Seamless queue continuation and similar track radio recommendations across local and online tracks.

2. **Reader & Studio Neural Integrations**:
   - **VoiceStudio Neural TTS Provider**: `VoiceStudioTtsProvider` in `neural-speech.ts` connects to local `http://localhost:3900/v1/audio/speech` with zero cloud telemetry and graceful offline fallback.
   - **OpenWhispr Local Speech Transcription**: `transcription.ts` transcribes voice memos and audio studio clips into formatted Markdown notes with frontmatter metadata.

3. **Skills & Partner Ecosystem Installed**:
   - Formally created and synced 9 agent skills across `C:\Users\mwali\.agents\skills` and `.agents/skills`: `open-seo`, `cap`, `appflowy`, `chatwoot`, `calcom`, `openproject`, `open-higgsfield-ai`, `clouds-against-humanity`, `supoclip`.
   - Codified and enforced mandatory "Never skip REA" policy across all investigations.

4. **Interactive Spectrum Visualizer & 1-Click Studio Transcription**:
   - **Real-Time Visualizer Animation**: Connected `requestAnimationFrame` loop in `music-hub.ts` to `audioDsp.getFrequencyData()`, updating `miniVis` (8 bars) and `fullVis` (24 bars) reactively with live audio FFT frequency data and graceful CSS fallback.
   - **Audio Studio Transcribe to Note**: Added 1-click `Transcribe to Note` action in `audio-studio.ts` passing audio buffers to `transcribeAudio` and saving formatted AnF Markdown notes directly into documents or daily notes.

5. **Open-SEO Article Audit & iCalendar (.ics) Task Export**:
   - **Open-SEO Article & Metadata Audit**: Built `auditSeo` in `article-publishing.ts` providing 0-100 SEO scoring, optimal title/subtitle length analysis, heading hierarchy checks, image alt-text verification, and actionable suggestions. Connected directly to an `Audit SEO` toolbar tool in `writing.ts`.
   - **Open Graph & Twitter Social Metadata**: Automatically generates `og:title`, `og:description`, `og:type`, `og:url`, `og:image`, and `twitter:card` tags during HTML article exports.
   - **RFC 5545 iCalendar (.ics) Task Export**: Built `tasksToIcs` in `dashboard-data.ts` and added an `Export tasks (.ics)` action button to the Dashboard task drawer, converting markdown checklist tasks into standard `VTODO` calendar files compatible with Cal.com, Outlook, Apple Calendar, and Google Calendar.
   - **Companion App Catalog Synced**: Updated `apps-catalog.ts` with all 15 requested companion apps.
   - **Full Verification**: 386/386 unit tests passing across 53 suites, 138/138 e2e tests passing, 11/11 release checks passing, and Vite production build clean in 5.73s.


6. **Kanban Board, Podcasting 2.0, Spotify Audio Crossfade & Swarm Simulation (2026-11-08)**:
   - **Interactive Kanban Task Board (AppFlowy / OpenProject)**: Extended `DraftTask` and `draftTasks` in `shared/domain/dashboard-data.ts` with `TaskStatus = 'todo' | 'in-progress' | 'done'` recognizing `- [ ]`, `- [/]`, `- [~]`, and `- [x]`. Added a 3-column Kanban board to `dashboard.ts` and `dashboard.css` with counters and toggleable `List View` / `Kanban Board` modes.
   - **Podcasting 2.0 XML Namespace**: Added extraction of `<podcast:chapters>`, `<podcast:transcript>`, and `<podcast:soundbite>` to `podcast-feeds.ts` with defensive DOM queries and comprehensive unit test assertions.
   - **Spotify-Grade Audio Crossfade**: Embedded dedicated `GainNode` parameter automation in `audio-dsp.ts` providing sample-accurate `fade(targetGain, durationSeconds)`, `setCrossfadeDuration(0-12s)`, zero-zipper click elimination, and subscriber reactivity.
   - **MiroFish Swarm Simulation & Consensus Engine**: Built `ai/swarm-simulation.ts` providing offline multi-agent simulation across Security, Architecture, UX, and Standards personas with consensus indexing and 1-click Markdown export.
   - **Verification**: **394/394 unit tests passing** across 54 suites, **138/138 e2e tests**, 11 release checks, and Vite production build green in 6.92s.

7. **Spotify Crossfade Chips, Audio Clip Exporter, Security Cards, Brag Generator & Chatwoot Inbox (2026-11-08)**:
   - **Spotify Crossfade UI & Automated Transitions**: Added interactive crossfade chips (`Off`, `2s`, `4s`, `6s`, `8s`, `12s`) to Music Hub full player with automated sample-accurate Web Audio DSP fading on track advance and playlist transitions.
   - **Cap / Supoclip Audio Studio Clip Exporter**: Added `slicePcmAudio` in `audio-data.ts` and UI in `audio-studio.ts` with duration selector (`15s`–`120s`) exporting standalone 16-bit PCM WAV clips. Re-exported domain audio files to remove ~4,000 lines of duplicate code.
   - **Clouds Against Humanity Challenge Cards**: Built `security-cards.ts` evaluating offline-first architecture, privacy, AES-GCM cryptography, Web Audio DSP, and RFC standards with interactive scorecards.
   - **Latent-Spaces Brag Document Generator**: Built `brag-document.ts` analyzing completed tasks into structured engineering accomplishment documents with a 1-click `Brag Doc` button in the Dashboard task drawer.
   - **Chatwoot Community & Support Inbox**: Built `chatwoot-inbox.ts` providing offline-first support thread triage (`open`, `pending`, `resolved`), reply appending, channel filtering, and 1-click Markdown thread export.
   - **Verification**: **409/409 unit tests passing** across 58 suites (100% green), **138/138 e2e tests**, 11/11 release regression checks, and Vite production build clean in 4.97s.

## Next priorities

1. Continuous UI polish and automated live testing across Windows and Android devices.
2. Remove now-unreachable legacy scraping layer in `streaming-provider.ts` once all callers rely on the unified Audius/YouTube/Subsonic providers.

## Partner protocol

- Read `HANDOFF.md`, `docs/BUILDER-RUNBOOK.md` and this file first.
- Report state before starting; append a dated result before stopping.
- Do not regenerate `windows/src/workspace/library.ts` or `native-music-player.ts` from an old template.
- Do not run `cargo build`/`npm run pack` while another builder is packaging; the shared target dir locks.
