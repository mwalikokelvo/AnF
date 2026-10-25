# Marketplace repair and vault fixture checkpoint

25 October 2026. Source is based on AnF main, preserving its newer music, shared
modules, mode rail, contracts and CI. Older local development work is preserved
separately; it has not been used to replace main wholesale.

## Marketplace repair

The public registry and two sample assets are published on main at
`c09617a118156369adbc4dfe901efedbbf5a396d`. Public registry HTTP 200 was verified.
Follow-up `742bb6d6a22be5823c993d6313324189e38df6ae` pins marketplace line endings
to LF so Windows checkouts preserve the content hashes.

The Windows marketplace implementation is carried onto this source checkpoint:
Settings dialog, included offline samples, themes/restoration, bounded add-on
storage, registry fetch, opaque-origin plugin frame and scoped API/actions.
The root catalog publication alone does not add the UI to an installed app.

Strict TypeScript and production Vite build pass. Manifest/theme/hash and sandbox
lifecycle/sender tests pass. Three native tests pass: traversal/hash/atomic
updates, repository restriction and script-document breakout escaping.
Native tests required building the real 0.1.21 hook relay first and used a
test-only empty resource override because optional offline-AI files are absent.
No dummy model/runtime was created; this is not an installer verification.

Real WebView dialog/CSP acceptance and a packaged update remain pending.

## Resumed Markdown milestone: encrypted vault fixture

The fixture tool now uses the Windows host's rusqlite 0.40.2 SQLCipher dependency
and depends on AnF's own shared schema constants. It refuses existing outputs.
Executed checks cover encrypted file header/plaintext exclusion, schema and
project readback, SQLCipher availability, integrity, wrong-key rejection, and
recovery-key reopening without project changes. Existing-fixture refusal was
checked separately and its hash remained unchanged.

Canonical fixture SHA-256:
`ab64711489ac3508c3aaab7f8a7da6c58b44883e23bade6f717c576aac0874ac`.
The key is the documented **public test key**, not an installation key.
SQLCipher HMAC errors during the wrong-key check are expected rejection evidence.
The JSON contract verifier also passes.

This clears the local fixture verification gap. Live SQLCipher storage remains
owned by the existing Windows/Android hosts. No key custody, database migration,
Android host or Flutter player was replaced. ThingsBook/`_core` is untouched.

## Still required

Prove the versioned shared bridge/adapters and encrypted migration/recovery on
both platforms; accept native music and the marketplace on devices; preserve
document-to-cloud confirmation; produce both updated EXE and APK for an app
delivery. No new application release or release tag is claimed here.
