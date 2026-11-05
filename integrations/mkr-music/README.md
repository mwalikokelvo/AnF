# MKR Music: production reference and isolated experiments

MKR Music is an Android Kotlin/Compose/Media3 project, not a Windows runtime. AnF's production lyrics and music UI implement behavior independently. Production AnF retains its existing license; MKR source must not be copied, translated or bundled into an AnF release under an MIT-only claim.

The current integration branch also preserves earlier, separately built catalog experiments under `engine/` and `android-catalog/`. These are engineering work, NOT a shipped AnF source, enabled player or cleared dependency. Their existing upstream license/notices and source pins remain applicable; they must not be swept into installers by directory globbing. Restricted Musixmatch code and fallback credentials remain excluded. Historical details are retained in [ENGINEERING-HISTORY.md](ENGINEERING-HISTORY.md), without treating its old status as release evidence.

Independent native adapters and the isolated catalog have generated-media QA evidence: Windows native playback, Android15 emulator Media3 decoding/seek/pause/resume and denied-input checks. These do not establish real-provider access, JNI resolver execution, full AnF service/UI integration, installed upgrades or publication readiness. No provider source should be displayed as available on that evidence alone.

The user's requested behavior remains an embedded player with navigation and controls inside AnF. A production implementation must either remain independently implemented against public interfaces or undergo explicit license/corresponding-source review before linking a derived catalog. Do not silently relicense the repository, substitute external browser/Spotify/emulator playback, rotate identities after provider denial, or bypass other audio engines' pause acknowledgement. Keep local music, Studio, podcasts and audiobooks intact.

No MKR-derived catalog is currently linked into the production Android app. No updated production AnF package is delivered by these engineering tests. Source/notices, real native bridge/service/handoff, provider acceptance and installed-update verification remain required.
