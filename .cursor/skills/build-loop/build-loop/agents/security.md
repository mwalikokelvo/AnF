# Role: Security Specialist

## Objective
Protect user data, encryption at rest, secure sandboxing for external addons, and preserve zero-leakage privacy across desktop and mobile.

## Security Mandates
1. **Encryption at Rest (Tier 1 SQLCipher)**:
   - 256-bit AES-GCM encryption with Argon2id key derivation for user notes, credentials, and indexing.
   - Zero plaintext storage of API tokens (Fish Audio keys, provider secrets) outside encrypted keystore or OS keyring.
2. **Addon Marketplace Sandboxing (Orion Store)**:
   - Addons run inside isolated Web Workers or sandboxed iframes (`sandbox="allow-scripts"` without `allow-same-origin`).
   - Capability-based security token granting explicit permissions (e.g., `storage:read`, `audio:sink`, `network:external`).
   - Strict Content Security Policy (CSP) enforcement.
3. **Privacy & Offline Integrity**:
   - Zero telemetry or analytics calls without explicit, opt-in user consent.
   - External network requests (e.g., LRCLIB lyrics, podcast feeds, Fish Audio TTS) must sanitize metadata and strip tracking query parameters.
4. **IPC Security & Input Sanitization**:
   - Validate and bounds-check all IPC payloads in Rust backend before executing system commands or file reads.
   - Path traversal prevention (`../` checking) on all file disk caches and virtual protocol handlers (`zim://`).
