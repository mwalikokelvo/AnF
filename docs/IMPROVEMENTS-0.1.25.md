# Windows 0.1.25 workspace improvements

This local Windows update implements the seven agreed improvements. Saved
projects retain their existing format. No release has been pushed or published.

1. Playback reports connecting, buffering, playing, paused and failure states.
   A thirty-second stalled start offers recovery. Retry reloads the native
   playlist and clears its prior decoder error. Native pipe commands explicitly
   forward retry and theme changes; unknown commands fail immediately. Opening
   music during a background status request is queued rather than dropped.
2. The Audio section has Music Hub and Audio Studio tabs. Local and Spotube
   sources share the workspace theme. Spotube uses its own player while visible;
   AnF keeps compact transport controls when navigating elsewhere. Switching to
   local music awaits a native pause acknowledgement.
3. AnF has a move handle, bounded positions remembered per display, a reset
   action, rounded resize surfaces and reachable header controls. Its Home view
   captures a note directly into saved projects and retains unsent capture text.
4. Primary navigation contains Home, Chat, Documents, Audio and Settings.
   Sources/Writing and Music Hub/Audio Studio remain available within their
   respective sections. Conversation history is shown within Chat.
5. Home shows recent work and quick capture, with habits folded away. Project
   names appear in Chat and Writing. Search notices stay beside search results.
   Floating captures refresh Home's recent work without changing the open draft.
6. Search results show a source domain, title, short description and Add to
   sources/Open website actions. Tracking parameters are removed where safe;
   the visible card never prints the full query string. Added sources are still
   read locally before being used as evidence.
7. About AnF shows the installed version and component readiness. The explicit
   update check reads public GitHub releases without account credentials and
   offers the release page for review. Support exports contain only allowlisted
   version, platform, memory and component-readiness fields. They exclude logs,
   user paths, documents, conversation text and provider data.

Validation includes Rust regressions and a support-export privacy test; real
native audio decoding, HTTP failure and retry recovery; Chromium navigation,
responsive layouts, local WAV playback and transport handoffs; and Windows
WebView2/Flutter checks at the PC's actual accessibility scale. Packaging records
and exact counts are maintained in the workspace's `LOCAL-BUILD-STATUS.md`.

External Spotify/provider playback still needs a valid provider session. A 401
offers provider settings to reconnect; these tests do not authenticate a user
or bypass a provider restriction.

This package targets Windows. Shared dashboard/player source changes also apply
to future Android builds; the Android APK version is unchanged in this pass.

This product includes software developed by Kingkor Roy Tirtho.
