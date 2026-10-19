# Android release contract

Android lagged at 0.1.21 because subsequent Windows work regenerated shared web
assets with `--assets-only`; that does not run Gradle or replace an APK. The
platform workflows were independent, so a Windows package could pass without
building current Android source. An older APK on disk was not proof of parity.

Every platform build/release workflow now depends on the reusable
`android-release-gate.yml` job. That job runs `verify-agent-gate.mjs --release`,
which builds real release and debug APKs and verifies them. Hosted CI has not run
locally; account billing previously prevented hosted execution. Publication stays
disabled. The embedded Spotube review workflow also requires the core APK gate,
then builds its additional Flutter runtime separately.

`node scripts/build-android.mjs` requires Java 21, Gradle 9.4.1 and the SDK prepared
by `prepare-android-sdk.mjs`. `--offline` uses the existing Gradle dependency
cache and fails if incomplete. `prepare-android-sdk.mjs --check` only verifies an
already installed SDK. Set `ANDROID_HOME`, `JAVA_HOME`, optional `GRADLE_BIN`,
`GRADLE_USER_HOME` and `ANF_PYTHON_BIN` to local installations. The checked
source version comes from the Tauri configuration; application ID is read from
Android's literal Gradle declaration so identity migration cannot evade validation.

The verifier checks both real APK manifests for application ID, version name and
version code; all packaged web bytes against freshly generated assets; a
fingerprint of product source/build inputs; ZIP CRC and duplicate entries;
encrypted-storage native runtime; 16 KB ZIP alignment; and the debug certificate.
It writes `releases/android-release-verification.json` and `SHA256SUMS-Android`.
Missing/stale APKs fail. Assets-only success cannot satisfy the release gate.

`-unsigned.apk` is not installable until signed. `-debug.apk` is installable with
a development certificate, not a production release key. Neither is presented as
a store-signed release. Production signing keys remain outside Git and CI. New
AnF application identity is a separate app: export a backup from the old app,
retain that installation and import into AnF. Do not uninstall the legacy app or
run its same-package destructive upgrade fixture against the new identity.

The base package includes local reading, encrypted storage, local media and shared
workspace features. Native Android Spotube is a separate `--with-spotube` build
requiring generated Flutter release/debug AARs. Their absence must be reported;
it is never equivalent to a provider authentication fix or catalog access.

On this Windows JDK, `Unable to establish loopback connection` / Unix-domain
`Invalid argument: connect` can be avoided with a short existing temp directory.
Create a workspace-only short drive mapping, create `.tools/javatmp`, and set
`JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=R:/.tools/javatmp -Djava.io.tmpdir=R:/.tools/javatmp`
in the same process that creates the mapping. Drive mappings may differ between
normal and elevated tokens. Do not delete Gradle caches or user data to fix it.

Native reading word positions use Android `onRangeStart` UTF-16 offsets. Only the
active utterance's valid range is forwarded; paused/stopped/replaced utterances
cannot move the current highlight. Engines without word events keep sentence
precision. Device/engine execution remains distinct from APK compilation checks.
