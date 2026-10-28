# AnF 0.1.22 — release candidate

This update contains PR 47 and the later music controls already on main. It is not a claim that the entire historical feature backlog is complete.

## Included

- Windows glass navigation rail, four-second collapse, hover/keyboard reopening and a remembered Keep open toggle.
- Scrollable icon navigation in narrow Windows windows, with reduced-motion support. Android retains its own navigation.
- Windows Settings catalog linking to official open-source app releases. It does not install those apps.
- Offline synchronized lyrics from imported LRC files and supported embedded audio tags. Relative folder matching prevents two albums' identically named tracks from receiving each other's lyrics; ambiguous matches are skipped.
- Visible Windows task status above the music dock, clearer busy cursors, and retained previous/next, album, artist, genre and recently played controls.
- Lyrics regressions included in release CI.

## Update identity

Windows remains `fr.louisraille.coucou`; Android remains `com.coucou.workspace`, versionCode 1022. Storage and encryption identities are unchanged. Keep the previous app installed when testing an update; do not uninstall to bypass a certificate mismatch. Android distribution requires the original production signer, verified against the preceding release.

## Publication gates

At preparation time, source tests passed but 0.1.22 packages and installed-upgrade tests had not yet run. Do not describe this file alone as proof of a verified release. Use the current build results and SHA-256 manifests.

The existing Windows certificate is self-signed. A signature from it is not a publicly trusted publisher identity and does not remove warnings on other PCs. Do not install a root certificate or disable security protections as part of this update. Trusted signing-provider enrollment remains separate.

The recorded Defender detection requires current-candidate review; a successful build or signature does not clear it. Public Windows publication remains paused until the applicable security checks are satisfied. Unsigned, self-signed, debug and production-signed packages must be labeled accurately.

## Planned upgrade validation

Use previous Windows run 40603774832 / artifact `AnF-Windows-setup` and Android run 40603777490 / artifact `AnF-Android`, while those artifacts remain available. The workflow input now also supports older `Coucou-*` names. Tests use disposable data, not the owner's active library. Android emulator upgrade checks use a disposable CI key and therefore do not replace the separate production-certificate comparison.
