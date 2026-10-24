# A&F fenced example handling — 24 October 2026

Current editable source: `build-work/af/work/coucou`. This follows Home refresh safety. Balanced reading/writing/AI/Music Hub/Audio Studio scope remains confirmed. Earlier exports/packages and synced references are preserved.

## Implemented

Tasks, habit tracking and knowledge-reference extraction now share a fenced-code line filter. A closing fence must use the opening character, have at least its length and contain no trailing information. Shorter runs, mixed markers and apparent closers with trailing text cannot expose example checklists as real tasks. Unclosed fences keep subsequent example content excluded.

Habit state is derived from the filtered task parser, with the last real habit entry winning. It also accepts the same supported bullet forms as task extraction. Knowledge backlinks, tags and related graph/tag-tree data no longer use a separate, weaker three-character-fence expression. Original task line numbers are preserved for navigation.

This remains a limited text extractor, not a full Markdown parser. Indented code, nested container semantics and more advanced inline code are not completed by this change. Source writing is unchanged; only extracted workspace metadata changes. No Java/Rust/Flutter, schema or protocol changes.

## Verification

All **24** focused suites pass. Extended dashboard/knowledge tests cover short/long closers, marker mismatch, trailing closing text, supported indentation, unclosed blocks, task line numbers, real habit precedence and excluded example backlinks/tags. Existing workspace/component suites remain passing. Windows TypeScript and Vite frontend PASS.

Evidence: `build-work/verification/fenced-examples-2026-10-24/`. Android strict TypeScript, interface bundle and debug build PASS (38 tasks, 4 executed / 34 up-to-date). Signature v2, ZIP CRC, 16 KB ZIP alignment, packaged JS/CSS identity and three Flutter engine/AOT ABI checks PASS. Existing 32-bit SQLite ELF alignment caveat remains; ZIP alignment is not universal runtime acceptance. No Android device is connected. These checks do not establish live device rendering, native storage or hardware acceptance. Native Windows tooling and original production signing access remain unavailable. No production release is declared.

## Next steps

On both devices, verify task links, habits, backlinks and tags using notes with fenced examples. Continue pending hardware journeys and Windows native validation/embedding, Android music discovery/audio coordination, stable source anchoring/background jobs and collaboration baseline.

## Artifacts

- Source export: `build-work/AF-0.2.0-fenced-examples-checkpoint-2026-10-24.zip`; checksum under `build-work/verification/`.
- Development APK: `build-work/artifacts/AF-0.2.0-embedded-music-development-fenced-examples-2026-10-24.apk`.
- APK: 191778429 bytes; SHA256 `4088c65c786bf3f0d001211fb3135c24282af12e73698abf8273ec181b1bebea`.
- Same development package `com.coucou.workspace.dev`, version `0.2.0-dev` / 2000 and existing development certificate. Native/device acceptance and production release remain unverified.
