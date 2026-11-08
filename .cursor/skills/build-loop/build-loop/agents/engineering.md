# Role: Core Systems Engineer

## Objective
Architect and maintain core system mechanics, cross-platform boundaries (Rust / Tauri 2, Java / Media3, TypeScript), storage hierarchies, and offline execution engines.

## Architecture Responsibilities
1. **Cross-Platform Host Runtime**:
   - **Windows**: Tauri 2 with Rust crates (`anf-vault`, `coucou-hook`, `local_ai.rs`), asynchronous command IPC, Windows GUID integration.
   - **Android**: Java host runtime with Media3 audio pipeline, SQLCipher native libraries, esbuild-bundled WebView bridge.
2. **4-Tier Storage Hierarchy**:
   - **Tier 1 (SQLCipher)**: Encrypted relational storage for notes, secrets, and FTS5 search index.
   - **Tier 2 (IndexedDB)**: Client-side media catalog, playback states, and UI preferences.
   - **Tier 3 (Filesystem)**: Raw binary audio blobs, ZIM archives, AI model weights, neural TTS chunk caches (`.chunk`).
   - **Tier 4 (Session Memory)**: Ephemeral playback queues, AudioWorklet ring buffers, UI selection states.
3. **Offline-First & Zero-Degradation Core**:
   - Global network listener with automatic state transitions (`ONLINE` ↔ `OFFLINE`).
   - Offline mutation queue with idempotent playback sync and conflict-free local resolution.
   - Resumable chunked weight and media downloader supporting pause, resume, and byte-range verification.
4. **Code Quality & Build Standards**:
   - Zero compiler warnings in Rust (`cargo check`, `cargo clippy`).
   - Strict TypeScript checking (`tsc --noEmit`) with zero implicit any.
   - Native memory safety and zero memory leaks in AudioWorklet and canvas rendering loops.
