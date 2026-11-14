# Embedded storage boundaries

The pinned-source preparation puts embedded logs in the app support directory at
`logs/spotube.log`. It leaves the standalone logger branch intact when
`ANF_EMBEDDED=false`; it does not read, move or delete existing user logs.
Windows runner metadata uses AnF/AnFMusic, and the database filename is
`anf-spotube.sqlite`. Source transformations fail on missing or duplicate
patterns and refuse to apply twice. Run:

```sh
node scripts/check-spotube-storage-patches.mjs
```

This is not proof of complete profile isolation. Before launching a Flutter
runtime in a disposable QA profile, audit actual Windows path-provider results,
SharedPreferences, metadata-plugin directories, temporary storage and
FlutterSecureStorage. In particular, upstream uses the secure-storage key
`encryption`; changing its namespace requires a compatible migration for existing
encrypted databases. Do not rename or replace live encryption keys merely to
make a fresh QA profile work. Environment-variable redirection alone is not
proof that native Windows known-folder or credential APIs are isolated.

Source patch tests do not establish Flutter compilation, native playback,
installed upgrade compatibility or permission to publish the combined edition.

## Windows dependency audit (locked versions)

The archive SHA256 values for the three packages below were checked against
`integrations/spotube/pubspec.lock` before reading their source. No plugin was
executed and no Windows credentials or user files were inspected.

| Dependency | Storage behavior relevant to QA |
| --- | --- |
| path_provider_windows 2.3.0 | Support and cache use native RoamingAppData/LocalAppData known folders plus executable CompanyName/ProductName metadata. Documents and Downloads are unscoped known folders. Temporary storage calls GetTempPath. |
| shared_preferences_windows 2.4.1 | The default shared_preferences.json uses the path provider's application support directory. A different working directory or APPDATA variable is insufficient evidence of isolation. |
| flutter_secure_storage_windows 3.1.2 | Its default Dart FFI implementation keeps a DPAPI-protected flutter_secure_storage.dat under application support. Backward compatibility defaults to enabled and can read/delete legacy entries. The legacy native implementation uses application-scoped .secure files but a fixed-prefix Windows Credential Manager master-key target. |

The upstream Dart key named `encryption` alone is therefore **not** proof that
two applications share their database key: file paths also matter. Conversely,
renaming the executable's product metadata alone does **not** prove that the
legacy Credential Manager master-key target is isolated. Legacy reads can enter
the native key path, so even a read-oriented startup needs this audit.

For actual Flutter acceptance, use a disposable Windows VM or hosted runner with
an independent OS user profile and credential store. Do not enable Windows
features, create accounts, change registry known folders or alter existing user
credential entries just to launch a local smoke test. Give the test generated
media only, explicit temporary/download destinations, no imported preferences,
and no production plugins or service credentials. Check actual resolved paths
and storage before/after the run. A dedicated QA-only executable identity is an
additional boundary, not a replacement for OS-profile isolation.

Disabling backward compatibility or changing a production secure-storage prefix
requires a separately reviewed migration and installed-upgrade test; neither is
part of the log patch. Full dependency/storage coverage is still pending.
