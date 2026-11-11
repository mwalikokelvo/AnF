# MKR Music: production reference and isolated experiments

MKR Music is an Android Kotlin/Compose/Media3 project, not a Windows runtime. AnF's production lyrics and music UI implement behavior independently. Production AnF retains its existing license; MKR source must not be copied, translated or bundled into an AnF release under an MIT-only claim.

The current integration branch also preserves earlier, separately built catalog experiments under `engine/` and `android-catalog/`. These are engineering work, NOT a shipped AnF source, enabled player or cleared dependency. Their existing upstream license/notices and source pins remain applicable; they must not be swept into installers by directory globbing. Restricted Musixmatch code and fallback credentials remain excluded. Historical details are retained in [ENGINEERING-HISTORY.md](ENGINEERING-HISTORY.md), without treating its old status as release evidence.

Independent native adapters and the isolated catalog have generated-media QA evidence: Windows native playback, Android15 emulator Media3 decoding/seek/pause/resume and denied-input checks. These do not establish real-provider access, JNI resolver execution, full AnF service/UI integration, installed upgrades or publication readiness. No provider source should be displayed as available on that evidence alone.

The user's requested behavior remains an embedded player with navigation and controls inside AnF. A production implementation must either remain independently implemented against public interfaces or undergo explicit license/corresponding-source review before linking a derived catalog. Do not silently relicense the repository, substitute external browser/Spotify/emulator playback, rotate identities after provider denial, or bypass other audio engines' pause acknowledgement. Keep local music, Studio, podcasts and audiobooks intact.

No MKR-derived catalog is currently linked into the production Android app. No updated production AnF package is delivered by these engineering tests. Source/notices, real native bridge/service/handoff, provider acceptance and installed-update verification remain required.

The isolated Android library now has a page lifecycle owner,
`AndroidMkrPageHost`. An Activity must forward main-frame page starts, page
finishes and destruction to it, and supply a connector for an already approved
service session. It revokes the old page before navigation, discards connections
that arrive after cancellation, prevents duplicate attachment and supports both
AnF and legacy Coucou origins. Closing the page detaches browsing without stopping
ongoing service playback. A missing renderer still cannot approve a new audio
handoff. The production MainActivity does not instantiate this host yet.

The experimental prepared connection now implements that page contract. Native
selection validation and a fresh positive other-audio acknowledgement precede
foreground promotion; resolving media and constructing a decoder follow the
actual foreground-service start. Cold browsing does not create a notification
or decoder. Ordinary OS/Binder play remains denied until promotion. A cancelled
resolution with no accepted playback releases the last detached owner and its
notification; accepted playback retains service ownership across page detach.

[Native run43054426348](https://github.com/mwalikokelvo/AnF/actions/runs/43054426348)
at `22d719a` passed43 host tests and21 Android15 component tests, retaining the
previous19 cases. The actual TS client/WebView/Binder/Media3 controls case now
starts cold and waits for audio acknowledgement before native promotion.
Separate cases cover invalid selection, denied acknowledgement and cancellation
during resolution after promotion. System notification publication/removal is
observed with bounded waits; foreground state is checked before resolution.
The controls case finishes paused and reconnects to the same service token;
it does not prove ongoing audible playback after Activity destruction. This
remains generated-media engineering evidence, with no production Activity
bootstrap, enabled source, real-provider or installed-update acceptance.

`MkrPageLifecycle` now provides Java-callable main-frame navigation and
close-before-destroy callbacks for an optional native host. Its lazy owner holds
application context and the handoff coordinator, retaining the accepted session
token across recreated pages. Reconnection validates the live prepared service
before acquiring a new lease; it does not create a replacement controller for an
already owned service or share ownership with an unrelated session.

[Native run43072264007](https://github.com/mwalikokelvo/AnF/actions/runs/43072264007)
at `a509af6` passed43 host tests and22 Android15 cases, preserving all prior21.
The new case uses actual Java WebViewClient callbacks, separate QA Activities,
modern/legacy-origin pages, the real TS client and muted generated-media Media3.
It verifies one catalog/controller factory, one decoder and the same session
token, with new audio acknowledgements after the first page is destroyed.
This is an isolated lifecycle fixture, **not AnF's MainActivity**. Forwarding
these callbacks and packaging an optional reviewed runtime in the real AnF app
remain unfinished; the production app still does not register this service.

[Native run42211028416](https://github.com/mwalikokelvo/AnF/actions/runs/42211028416)
at `69731c4` passed43 host tests and15 Android15 component tests, including real
WebView/Binder navigation, delayed connection delivery, destruction and legacy
origin checks. The previous14 cases remain enabled. A stopped-service successor
race exposed during this work was fixed by counting native connection handles
instead of relying on delayed Android unbind callbacks. This evidence uses a
disposable test identity and synthetic media; it does not establish production
Activity integration, provider access, physical-device behavior or update signing.


Renderer recovery and responsive dock checks passed in
[run42058704736](https://github.com/mwalikokelvo/AnF/actions/runs/42058704736)
at `6d7c6eb`. A failed status refresh immediately updates disabled controls and
keeps the recovery action usable. The MKR dock owns its layout and theme instead
of sharing Music Hub's compact-player class. Dark/light captures at1280,390 and
320 pixels verify full metadata rows and no horizontal overflow; phone/tablet
navigation markers verify dock clearance. Existing Music Hub styles are unchanged.
This is mocked-native Edge renderer evidence, separate from actual Android
service integration, provider playback and a distributable AnF package.
