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

## Next priorities

1. Continuous UI polish and automated live testing across Windows and Android devices.
2. Remove now-unreachable legacy scraping layer in `streaming-provider.ts` once all callers rely on the unified Audius/YouTube/Subsonic providers.
3. Audio Studio waveform timeline integration for directly transcribing recorded vocal tracks into Note drafts with OpenWhispr.

## Partner protocol

- Read `HANDOFF.md`, `docs/BUILDER-RUNBOOK.md` and this file first.
- Report state before starting; append a dated result before stopping.
- Do not regenerate `windows/src/workspace/library.ts` or `native-music-player.ts` from an old template.
- Do not run `cargo build`/`npm run pack` while another builder is packaging; the shared target dir locks.
