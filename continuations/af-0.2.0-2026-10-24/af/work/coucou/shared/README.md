# Shared application core

This is the platform independent source boundary for the staged A&F unification.

- `audio/denoise.ts`: preserved overlap-add FFT spectral subtraction, profile validation, progress and cancellation.
- `audio/queue.ts`: preserved queue reconciliation, repeat, shuffle and ordering.

These implementations were moved byte for byte from the Windows workspace directory. Android's shared Audio Studio and Windows now consume the same implementation. Old module paths re-export the shared implementation for existing consumers; they contain no parallel algorithm.

Native storage, key management, media decoding and OS controls still use platform adapters. The Android Java SQLCipher repository and Windows Rust SQLCipher repository have different schemas and key custody. Do not replace them with a single database or silently reinterpret existing encrypted files. A versioned migration, encrypted fixture round trip and recovery verification must precede that consolidation.

The complete shared Rust core, unified responsive shell, neural TTS, offline speech recognition and feature parity remain migration goals. Moving these two modules does not establish those capabilities.
