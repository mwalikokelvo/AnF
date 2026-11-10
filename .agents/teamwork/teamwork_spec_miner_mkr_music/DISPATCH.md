# Dispatch Log

## 2026-10-30T23:49:20Z
- Sender: b07e241c-69f4-4bfe-8b7f-f8396faedbd2
- Priority: MESSAGE_PRIORITY_HIGH
- Task: Probe and extract specifications for MKR Music audio player engine and LRCLIB synchronized lyrics integration in the context of AnF.
- Objective:
  1. MKR Music reference (https://github.com/mkr-infinity/mkr-music):
     - Architecture of MKR Music player engine (playback controls, state machine, playlist/queue, audio source handling, error recovery).
     - Interfacing with audio pipelines across platforms (Windows and Android).
  2. LRCLIB synchronized lyrics integration:
     - API contract (endpoints, params, response schema).
     - Structure of LRC format (time tags [mm:ss.xx], synced mapping, search algorithms).
     - Offline & Caching: local storage, fallback cascade (synced -> plain -> placeholder).
     - UI/UX: synchronized scrolling, active line highlighting, interactive seek-on-tap.
  3. Integration requirements with AnF Music Hub:
     - Interfaces and services needed for AnF's Music Hub to seamlessly host this engine.
