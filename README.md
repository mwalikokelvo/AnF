<div align="center">

<img src="windows/src-tauri/icons/128x128.png" width="96" alt="AnF icon">

# AnF

**A private workspace for writing, reading, music and audio, with Kevo, a voice assistant, on Windows. Android and Linux builds share the same workspace.**

![Windows 10/11](https://img.shields.io/badge/Windows-10%2F11-0078D4?logo=windows&logoColor=white)
![Android](https://img.shields.io/badge/Android-8%2B-3DDC84?logo=android&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-AppImage%20%7C%20deb%20%7C%20rpm-FCC624?logo=linux&logoColor=black)
![Tauri 2](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

</div>

---

AnF keeps your documents, notes, books and audio on your own devices. There is no account and no telemetry. It only talks to the services you set up, and your keys stay in the operating system's credential store.

## What's in it

### Kevo (Windows)

Kevo is AnF's voice assistant, formerly called JARVIS. Say "Kevo" or "Hey Kevo", or type a request in its box.

- **Instant commands:** the time and date, sums, timers and reminders ("remind me in 10 minutes to call Mum"), play music, what's playing, today in history, random advice, take a note, search your notes, open apps and places, search the web, "say that again", "stop".
- **New lookups:** current weather for any city (Open-Meteo), top Hacker News headlines, and live cryptocurrency prices (CoinGecko).
- **Questions:** anything else goes to the unified offline local model on your PC. The answer is shown and spoken sentence by sentence as it is written, and a Stop button ends it.
- **Voice pack:** 13 voices ship with every build, including Kevo's own gentle bass voice. Pick one from the voice list in Kevo's panel and press "Hear this voice" to play its recording. Kevo's replies are spoken by the Windows voice that best matches the chosen voice's accent and gender; the recordings are not a speech engine. The first second of the chosen recording is the chime Kevo plays when it hears its name.
- **Offline Hearing & Speech:** Kevo's hearing engine runs fully offline on your PC using sherpa-onnx streaming wake-word and speech-to-text models in native Rust, with zero audio sent over the network.

### Music Hub

- Your local music, audiobooks and RSS podcasts in one library, with playlists, favourites, listening history and a player that stays open while you work elsewhere in AnF.
- Streams from open sources: Audius, Internet Archive and LibriVox, and your own Subsonic or Navidrome server. One search covers all of them.
- Crossfade (off to 12 s), an equaliser with presets, loudness levelling, playback speed and a sleep timer (minutes, end of track or end of chapter).
- **Track cards** show what the file holds: artist, album, album artist, composer, track and disc, year, genre, format and source, duration and size, bitrate, sample rate, bit depth, channels, BPM, chapters, lyrics and cover art.
- An embedded Spotube player is available as an opt-in review build only; standard builds don't include it.

### Audio Studio

Separate from the Music Hub, for working on recordings: import files or a folder, queue and play them, clean up speech (noise profile and hum filter, with a before/after comparison), convert formats, export a WAV or a short clip (15 to 120 s), and edit titles, artists and artwork. "Transcribe to Note" turns a recording into a note when a local speech-to-text server is running on the PC.

### Writing, reading and the vault

- A Markdown editor for drafts and notes (up to 2 MB per draft), with an outline, quick capture, daily notes, a task list and board, academic research citations (APA/BibTeX), and exports.
- A reader for your documents and books supporting EPUB, PDF (with offline OCR for scanned pages), CBZ comic books, FB2, MOBI/Kindle, DOCX, ODT, RTF, and WebDoc archives, featuring FSRS-4.5 spaced repetition review cards, bionic reading fixation, and read-aloud narration.
- **Vault:** projects are stored in an encrypted SQLCipher (AES-256) database. Vault search returns the 100 best matches and stays under 50 ms (p95) on a vault of 2,000 projects, checked by an automated test.

### AI chat & local intelligence

- Chat about your documents with the unified high-performance local model (`DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-GGUF` with dual Vulkan GPU and CPU runtimes, downloaded and verified on first use), or with Anthropic, OpenAI or Gemini using your own API key.
- Includes pure TypedArray Q4_0 and Q8_0 quantized tensor kernels, sub-millisecond intent routing, and local context compaction.

### Device security & LocalSend P2P

- **LocalSend P2P Transfer:** Fast multicast UDP discovery and binary chunk streaming (`0x4C534E44`) for secure, direct file transfer between PC, Android, and local devices with zero cloud relay.
- **Built-in Security & Audit:** Continuous desktop security auditor scanning for secret leakage, CSP origins, AST patterns, dependency CVEs, and Model Context Protocol (MCP) tool poisoning protection.

### Your devices together

An opt-in link between your Android phone and your Windows PC over your own Wi-Fi: authenticated and encrypted, with no cloud relay. From the phone you can send a question to your PC.

### Coding-agent island

The Windows and Linux app keeps the upstream Coucou island at the top of the screen: Mochi shows your Claude Code sessions live and lets you answer permission requests and questions with a click. If AnF isn't running, the hook exits at once, so Claude Code is never blocked. Installing the hooks backs up `~/.claude/settings.json` and shows you the change before writing it.

## Platforms

| Platform | What you get |
|---|---|
| **Windows 10/11** | The full app, including Kevo and the offline models. |
| **Android 8+** | Documents, reader with read-aloud, writing, Music Hub, Audio Studio, encrypted backups and the link to your PC. AI questions open in your own browser accounts or go to your PC; there is no on-device AI. |
| **Linux** | The same app as Windows (Kevo is made for Windows and isn't tested on Linux), as AppImage, .deb and .rpm (x86_64). The island sits on the top edge on layer-shell compositors (KDE Plasma, COSMIC, Hyprland, Sway); on GNOME it opens as a normal window. |
| **macOS** | Only the upstream notch companion in `NotchBuddy/`, without the AnF workspace. |

Updating keeps your existing data: storage and app identities from the Coucou days (`coucou.db`, the Android package `com.coucou.workspace`) stay the same on purpose.

## Install

Builds are posted as previews on the [Releases](https://github.com/mwalikokelvo/AnF/releases) page. The Windows installer isn't code-signed yet, so Windows may warn before running it. When upgrading on Windows, install to the same folder.

## Build from source

**Windows** needs Node 24, Rust 1.99.0 and the MSVC build tools:

```powershell
git clone https://github.com/mwalikokelvo/AnF.git
cd AnF/windows
npm ci
./scripts/prepare-offline.ps1   # pinned local AI runtime, models and OCR, checked by SHA-256
./scripts/prepare-media.ps1     # pinned FFmpeg for audio conversion
npm run pack                    # installer and portable folder land in windows/release/
```

**Linux** needs Node 24, Rust 1.99.0 and these packages (Debian/Ubuntu names):

```bash
sudo apt install build-essential pkg-config \
  libwebkit2gtk-4.1-dev libgtk-layer-shell-dev libayatana-appindicator3-dev \
  librsvg2-dev libssl-dev libdbus-1-dev patchelf \
  gstreamer1.0-plugins-base gstreamer1.0-plugins-good ffmpeg
git clone https://github.com/mwalikokelvo/AnF.git
cd AnF/windows
npm ci
node scripts/prepare-linux.mjs
npm run pack                    # AppImage, .deb and .rpm land in windows/release/
```

**Android** needs Node 24, JDK 21, Gradle 9.4.1 and Android platform 37 with build-tools 36.0.0, with `ANDROID_HOME` set:

```bash
npm ci --prefix windows
npm ci --prefix android
node scripts/build-android.mjs  # APKs land in releases/
```

More detail is in [`docs/RELEASE-BUILDS.md`](docs/RELEASE-BUILDS.md) and [`windows/README.md`](windows/README.md).

## Where things are

- `windows/`: the Tauri 2 app for Windows and Linux (Rust in `src-tauri/`, TypeScript in `src/`, the voice pack in `voice-pack/`).
- `android/`: the Android app.
- `crates/anf-vault/`: the shared vault rules, in pure Rust.
- `NotchBuddy/`: the upstream macOS notch companion.

## Sister app

AnF Books (formerly ThingsBook), the reading and library app, lives in its own repository: [mwalikokelvo/ThingsBook](https://github.com/mwalikokelvo/ThingsBook).

## Contributing

Read [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md) first. Every change goes through a pull request.

## Credits

AnF is built on Coucou by [Louis Raillé](https://louisraille.fr). This product includes software developed by Kingkor Roy Tirtho.

## License

- **Code:** [MIT](LICENSE). Keep the copyright notice.
- **Name, Mochi character, icon, sounds and media:** © Louis Raillé, all rights reserved; see [LICENSE-ASSETS.md](LICENSE-ASSETS.md).
