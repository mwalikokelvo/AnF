# Shared application core

This is the platform independent source boundary for the staged A&F unification.

- `audio/denoise.ts`: preserved overlap-add FFT spectral subtraction, profile validation, progress and cancellation.
- `audio/queue.ts`: preserved queue reconciliation, repeat, shuffle and ordering.
- `domain/`: shared evidence snapshots, reading state/highlights, task/habit extraction, knowledge search/graph/tag logic, document metadata and follow-up rules. Its public entry is `domain/index.ts`. Windows and Android source consumers import this boundary directly; old workspace paths re-export the same implementation for compatibility.

The shared-domain architecture check independently bundles the neutral entry and rejects dependencies outside `shared/`. It also verifies that compatibility imports expose the exact same runtime values. Existing behavior suites continue to cover reading, evidence, search, capture, fenced examples and host integration. New native/platform work belongs behind adapters; do not import a Windows or Android host into the domain layer.

These implementations were moved byte for byte from the Windows workspace directory. Android's shared Audio Studio and Windows now consume the same implementation. Old module paths re-export the shared implementation for existing consumers; they contain no parallel algorithm.

Native storage, key management, media decoding and OS controls still use platform adapters. The Android Java SQLCipher repository and Windows Rust SQLCipher repository have different schemas and key custody. Do not replace them with a single database or silently reinterpret existing encrypted files. A versioned migration, encrypted fixture round trip and recovery verification must precede that consolidation.

The complete shared Rust core, unified responsive shell, neural TTS, offline speech recognition and feature parity remain migration goals. Moving these two modules does not establish those capabilities.
