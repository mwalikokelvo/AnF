# Contributing to AnF

Thanks for wanting to help AnF & Mochi grow! 🫶

AnF is an open-source, private workspace and desktop/mobile companion for Android, Windows, Linux, and macOS.

---

## 🛠️ Getting Started

### 1. macOS (Native Notch Companion)

**Requirements**: macOS 15+, Xcode 16+, [XcodeGen](https://github.com/yonaskolb/XcodeGen).

```bash
brew install xcodegen
cd NotchBuddy
xcodegen
open NotchBuddy.xcodeproj   # Press ⌘R to build & run
```

> **Note**: Never edit `NotchBuddy.xcodeproj` directly. Update `project.yml` and regenerate with `xcodegen`.

Check resting island dimensions across screens:
```bash
bash scripts/test-screen-geometry.sh
```

---

### 2. Windows & Linux (Tauri Workspace & Island)

**Requirements**: [Rust 1.80+](https://rustup.rs), Node.js 20+, MSVC Build Tools (Windows) or WebKitGTK packages (Linux).

```bash
cd windows
npm install
npm run build      # Runs TypeScript check and Vite build
npm run tauri dev  # Runs the desktop app with hot reload
```

To run Rust unit tests:
```bash
# Test the CLI hook relay (Claude Code, Antigravity, Gemini, Codex)
cd windows/hook && cargo test

# Test the core document engine & vault
cd ../../_core && cargo test
cd ../crates/anf-vault && cargo test
```

---

### 3. Android Workspace

**Requirements**: Android Studio Meerkat or newer, JDK 17+, Android SDK 34+.

Open the `android/` directory in Android Studio or build with Gradle:
```bash
cd android
./gradlew assembleDebug
```

---

## 🌟 Good First Contributions

- **Service Integrations**: Connect a new service (poller + `PillCatalog.swift` entry + UI card). See `StripePoller.swift` for reference.
- **AI Agent Support**: Hook integrations for coding agents (Antigravity, Claude Code, Codex, Cursor, Gemini CLI).
- **Workspace Tools**: Markdown editor improvements, Music Hub features, offline podcast & audio tools.
- **Emotes & Sounds**: New expressions or audio cues for Mochi.
- **Bug Fixes & Cross-Platform Polish**: Handling multi-monitor edge cases, layer-shell compatibility on Linux, or Windows notification integration.

---

## 📋 House Rules & Architecture Standards

1. **Zero Telemetry**: No trackers, no analytics, no external calls except to user-configured APIs.
2. **Key Security**: Secrets must go in native secure storage (macOS Keychain, Windows Credential Manager, Linux Secret Service), never in plain text or git.
3. **Responsive & Non-Blocking**: The CLI relay hook (`coucou-hook`) must never block coding agents. If the app is closed or unresponsive, exit immediately.
4. **Performance**: Zero CPU usage when the notch/island is hidden.
5. **Stable Identifiers**: Keep bundle ID (`fr.louisraille.NotchBuddy`) and storage keys stable to ensure seamless updates and data retention.

---

## 🚀 Pull Request Checklist

Before opening a PR:
- [ ] Code builds without warnings or TypeScript errors (`npm run build` in `windows/`).
- [ ] Relevant test suites pass (`cargo test` across crates, Swift test suites).
- [ ] Include a short screenshot or GIF for any visual or UI changes.
- [ ] Maintain single-topic, focused commits.
