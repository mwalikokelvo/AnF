# AnF identity and data compatibility

The desktop and Android release version is 0.1.31. The independently built macOS
version is unchanged. Native crates are `anf`, `anf-hook` and `anf_lib`.
Android Java packages move from the legacy package to `com.anf.workspace` under
`android/java/com/anf/workspace`; tests and optional music hosts follow that path.
The JavaScript interface is `AnFAndroid`; callbacks use `AnFSpeechDone`,
`AnFSpeechError`, `AnFSpeechBoundary`, `AnFMediaResult` and `AnFQuickCapture`.
Desktop bundle identifiers end in `.anf`; entitlement filenames use `AnF`.

## Existing desktop installations

AnF adopts an existing legacy config/local-data directory in place. New installs
use `%APPDATA%/AnF`, `%LOCALAPPDATA%/AnF` (Windows), or XDG `anf` directories.
An existing legacy directory wins even if a new directory also exists: no silent
merge, overwrite or deletion occurs. The existing SQLCipher filename, credential
service and account hash remain byte-identical, as does the WebView profile under
`webview-v014`. This preserves projects, vault history, preferences, API keys and
IndexedDB/localStorage. Renaming a live profile or recomputing its vault account
hash would make existing encrypted data inaccessible. Physical relocation is a
separate future opt-in operation requiring a stopped app and verified backup.

Legacy wire-format identifiers, authenticated encryption AAD, pairing codes,
conflict hashes, recovery-key kinds and backup extensions use escaped constants.
These constants are interoperability identifiers, not visible branding. Old
encrypted packs and project exports remain readable; new exports retain that
format so either app can exchange portable data. Never globally replace bytes
inside an encrypted file. Upstream links retain their actual destination through
URL encoding, and the upstream artwork license retains its legal names through
HTML entities. This does not grant rights to upstream artwork.

## Android is a separate installation

`com.anf.workspace` cannot access the legacy app's private storage or Keystore.
Keep the legacy app installed. In its Settings, export all conversations (or an
encrypted conversation backup), save the file through Android's system picker,
then open AnF Settings and restore the backup as new copies. Compare conversation
counts, text and attachments before considering removal of the legacy app.
A vault recovery key alone is not a conversation backup and cannot transfer an
Android Keystore wrapping key. Device-specific connections, system permissions
and installed speech voices must be configured again. No migration claims direct
access to the old sandbox. The new app's origin is `https://anf.local/`; new
IndexedDB storage is intentionally separate despite its compatible database name. Both old and new exports preserve
portable project payloads. Original exports and the old app remain untouched.

## Verification

`node scripts/check-branding.mjs` scans source names and content, excluding build,
vendor, model and binary trees. `node scripts/check-identity-migration.mjs` checks
portable encrypted backup interoperability and source storage identity invariants.
The Rust identity test exercises fresh and existing profile selection using an
isolated temporary directory. No check opens production credentials or data.
