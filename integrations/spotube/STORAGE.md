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
