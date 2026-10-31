# Listening capabilities

## Capability

AnF provides a usable personal listening library without API keys. Music, podcast
episodes and audiobook files share one player, editable queue, playlists, saved
spoken-audio positions, speed and sleep controls. Spotube remains the embedded
online listening source. This document distinguishes implemented functionality
from integrations that require another service or further development.

## Constraints

- Local library playback has no advertising, subscription, skip counter or API key.
  Storage capacity, per-file import limits and device codec support still apply.
- Source quality is displayed from file metadata. AnF does not upgrade audio to
  lossless or certify an end-to-end bit-perfect output path.
- Spotify's `spotify.github.io` repository is its open-source showcase website,
  not the Spotify application or a licensed media catalog:
  <https://github.com/spotify/spotify.github.io>.
- Spotify playback, account scopes and distribution permissions must be evaluated
  against its official SDK and policy. No Premium, unlimited audiobook, download,
  video, account or catalog entitlement is granted by installing AnF:
  <https://developer.spotify.com/documentation/web-playback-sdk>,
  <https://developer.spotify.com/policy>.
- The existing Spotube provider authentication failure (401) is not resolved by
  local library enhancements. Never show playback success based on a button alone.

## Implementation contract

Actor: the device's user. Surfaces: Audio → Music Hub → Local library, full player,
item details, queue, playlists and listening recap. Spotube opens automatically
when selected and remains a distinct engine; starting local playback suspends it.

| Requested experience | Actual implementation / remaining dependency |
| --- | --- |
| Music, podcasts, audiobooks | Local audio import with selectable content type; per-item spoken resume. Remote podcast feeds and audiobook catalog discovery are still pending. |
| Personal mixes | Liked, recently played and not played recently filters over actual local files. No invented recommendations, mood analysis or AI DJ commentary. |
| Lyrics / song information | User-provided LRC timestamps follow local playback; artist, album and source-format metadata shown. Licensed online lyrics and full songwriter/producer histories are pending. |
| Annual recap | Local playback time and top items for the current year; no seek-distance inflation. Does not include Spotube or deleted files. |
| Shared playlists | Export/import a validated playlist recipe; preview matched and skipped counts. Each recipient supplies their audio files. Real-time collaboration, Jam and Blend are pending. |
| Connect / handoff | Existing device media-session controls; no claim of Spotify Connect or cross-device audio transfer. Authenticated pairing, transport, position reconciliation and device authorization are pending. |
| Offline and quality | Imported files stored locally in IndexedDB; source metadata visible. Provider downloads and format availability require provider support. |
| Video shows / synchronized music videos | Pending a video player and licensed or user-supplied video source; not supplied by the showcase repository. |

Lifecycle: import → inspect/classify → play or queue → pause/resume → save local
positions. Restore never autoplays. Category and mix filters do not modify files.
Sleep timer pauses the local engine at the selected deadline and is intentionally
session-only. Playback speed persists. Queue edits persist and turn off shuffle
when reordering. Timed lyrics are plain text, bounded to 200 KB / 5,000 timestamps.

Data: media blobs and optional content-kind/LRC fields remain in the existing
IndexedDB track store; no migration erases old libraries. Local storage contains
bounded, validated per-item resume positions, annual seconds and rate; existing
player preferences retain favorites and queue. Playlist files contain titles,
artists and filenames only, never paths, credentials or media bytes. Ambiguous
matches are skipped. Imports create a new playlist and do not overwrite others.

Privacy and ownership: no new service, credential, automatic network request,
billing operation or background upload. Recap has an explicit clear action that
preserves audio and positions. Browser-profile storage is device-local, not part
of the encrypted project vault, and is not a cloud backup. Users control whether
they share exported playlist metadata, including filenames.

Failure recovery: malformed or oversized recipe/LRC files fail visibly; storage
and decode errors are reported; unknown playlist items are skipped with a count.
The player remains usable without cover art, lyrics or quality metadata. Listening
measurement undercounts gaps longer than three seconds rather than guessing.

Observability: UI playback state, visible queue and recap, browser runtime errors,
clock validation checks and Windows/Android real-WAV browser regressions.

## Non-goals and open questions

This release does not duplicate Spotify's proprietary service. Live group sessions
need an authenticated host/peer protocol, connection recovery and conflict rules.
Cross-device handoff also needs file identity and an available media source on the
receiving device. Online feeds/catalogs, video, licensed metadata and optional AI
DJ should each ship as complete, testable additions instead of inactive controls.
Online providers may require accounts or developer credentials even though local
features do not. No hardware, CarPlay or Android Auto integration is claimed.

## Handoff

Implement and verify the local listening slice directly. Preserve both existing
reader functionality and embedded Spotube. Package a new Windows release so the
visible installed app can actually receive the changes. Follow-on service work
must establish provider access and paired-device contracts before advertising
catalog counts, unlimited entitlements or real-time collaboration.
