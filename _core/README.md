# ThingsBook native core checkpoint

This core is compiled and tested on Windows x64. The released 1.6.0 EXE and APK
still use the existing web reader; they do not contain this core. Unified v5
remains unfinished.

Implemented: Argon2id/AES-GCM vault sessions; SQLx in-memory SQLite with FTS5,
reading positions and annotations; authenticated encrypted database snapshots;
bounded OPDS Atom/JSON parsing with metadata/navigation; lazy EPUB chapters and
embedded cover extraction; bounded UTF-8/UTF-16 TXT sections.

EPUB chapter output is plain text, not formatted reflow. PDF rendering, native
UI shells, network acquisition/sync, semantic embeddings and neural voices are
pending. Kotlin and Swift interfaces are generated but their applications and
target libraries have not been built. The shipped DLL is for Windows x64 only.

## Build and checks

From the workspace root, using the isolated verified toolchain:

```
python work/v5/native-check.py fmt --all -- --check
python work/v5/native-check.py test --all-features
python work/v5/native-check.py clippy --all-targets --all-features -- -D warnings
python work/v5/native-check.py build --release --features bindings
python work/v5/generate-bindings.py
python work/tests/native-ffi.py
```

New dependency downloads require a network permission grant. The cache helper
uses verified HTTPS to public crate sources and preserves Cargo checksums. Its
temporary loopback service and task-local configuration end with each command.
Generation and the Python DLL test require no network.

## Integration contract

Run document ingestion, Argon2 and database operations off the UI thread.
Formats are `EPUB` and `TXT`. DocumentSession.open accepts bytes, chapter(index)
reads one section on demand, and close drops held buffers. Returned plaintext
belongs to the caller and must be removed when locking the application.

LibrarySession keeps SQLite only in memory. Persist only export_snapshot()
ciphertext and the public vault salt in app-private storage. Keep document files
encrypted separately. Restore with LibrarySession.from_snapshot. This native
snapshot format does not replace the old encrypted .thingsbookbackup format;
an explicit migration/compatibility adapter remains necessary.

Lock the library and close every document session on panic/lock. Rust key and
input buffers use zeroization, but caller copies, SQLite-managed pages and OS
memory cannot all be guaranteed wiped. Platform hardware key storage remains
pending. No telemetry, private books, recordings, tokens or signing keys are
included in this checkpoint.

The Windows Python binding expects thingsbook.dll next to thingsbook.py.
Kotlin requires UniFFI's JNA runtime and Android ABI builds; Swift requires its
generated FFI header/module map plus Apple-target libraries. A generated
interface alone does not demonstrate a working native mobile app.
