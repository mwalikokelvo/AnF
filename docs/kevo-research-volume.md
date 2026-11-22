# Kevo Music Volume Control

## Research Summary

Leading voice assistants (Siri, Google Assistant/Gemini, Alexa+, Copilot, Mycroft/OVOS) all support media volume control as a core capability:
- Relative adjustments: "turn up the volume", "louder", "quieter", "volume down"
- Absolute: "set volume to 50%"
- Mute/unmute

Spotify Player API supports volume via PUT /me/player/volume (0-100), and device volume.

Open-source like Mycroft have music skills with volume.

AnF Music Hub already has a player; Kevo has music_play, pause, next, previous.

## Proposed Feature

Add actions:
- set_volume: set to percentage (0-100)
- volume_up / volume_down: relative by 10%
- mute / unmute

Using existing music player context methods if available, or Tauri commands for system/media volume.

Offline, no new APIs needed. Fits privacy model.

## Status

This branch created from main (SHA 349a692). Feature not present in main (code search confirmed no volume in kevo paths).

Next: implement in kevo-actions.ts with tests in windows/tests/, similar to previous_track.

Claude to review and push to main if safe.
