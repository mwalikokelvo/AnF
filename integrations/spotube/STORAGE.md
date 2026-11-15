# Embedded Spotube storage

The preparation recipe uses the pinned upstream source and strict, single-match
patches. A changed or already-patched database constructor, logger method, or
Windows storage identity fails preparation instead of silently skipping a patch.

The embedded database remains `anf-spotube.sqlite`. Windows company/product
metadata remains `AnF` / `AnFMusic`, exactly as before these guards. These changes
do not migrate or rename an installed AnF identity, settings store or database.

Embedded logging now selects `getApplicationSupportDirectory()` and writes
`logs/spotube.log`. It bypasses the standalone logger's Documents/external-storage
path. The original standalone branch remains available when `ANF_EMBEDDED=false`.
Existing log files are neither read, moved nor deleted by preparation.

Tests cover malformed/duplicate patch targets, CRLF inputs and preservation of
the standalone branch. The patches were also checked against the actual pinned
logger, database and Windows resource sources. Those are source checks, not proof
of native filesystem behavior or successful playback.

This does **not** establish complete profile or credential isolation. Windows
plugins can use native known-folder APIs rather than APPDATA/TEMP overrides, and
legacy credential storage can have shared targets. Native QA must use a genuinely
isolated disposable OS profile or machine; changing environment variables alone
must not be presented as safe isolation from the owner's libraries or accounts.

No user files, recordings, credentials, signing material or private voice models
belong in build fixtures or corresponding-source exports.
