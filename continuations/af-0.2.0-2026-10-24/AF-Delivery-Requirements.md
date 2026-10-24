# A&F delivery requirements

User instruction, 24 October 2026: every app update should include both the updated Windows `.exe` and Android `.apk`.

- Make both platform artifacts a delivery requirement; provide direct file links and identify the version/checkpoint.
- If a platform cannot build, state that explicitly with the concrete blocker. Never present an older installer, a frontend build or a source ZIP as the updated `.exe`.
- Prioritize completing the Windows native build and packaging gap before continuing a sequence of Android-only update deliveries.
- Preserve earlier releases and synced sources. Separate build/package checks from native/device verification and production release status.

This requirement is persistent project context for manual and hourly continuation work.
