# Reference: Voice & TTS Architecture

## Overview
AnF incorporates neural text-to-speech (TTS) and voice recording capabilities designed to function with local disk caching and offline resilience.

## Neural TTS Cache Pipeline (`tts-service.ts`)
1. **Cache Lookups Before Provider Dispatch**:
   - Each synthesis request is hashed into a 64-character SHA-256 chunk identifier (`<hash>.chunk`).
   - Disk is probed via `VoiceDisk.read(name)`. A valid chunk is served immediately (`source: 'cache'`), bypassing the network provider.
2. **Chunk Framing & Validation**:
   - Header validation: 40-byte fixed header containing magic signature, sample rate, audio format (`wav`, `mp3`, `ogg`, `opus`), and byte length.
   - Corrupt, truncated, or bit-flipped chunk files trigger deletion and a clean re-synthesis request.
3. **Resilience & Storage Boundaries**:
   - `ENOSPC` (Disk Full): When disk space is exhausted, synthesis audio is returned directly to the user for playback, but no file is written and no `.partial` temporary file is leaked.
   - Read/write error isolation: System I/O errors throw typed `VoiceCacheError` instances (`'disk-full' | 'invalid-audio' | 'empty-text' | 'io'`).

## Audio Studio Recording & Processing
- **AudioWorklet**: Real-time microphone capture on dedicated audio threads without UI thread stutter.
- **VU Metering**: Dual-channel peak and RMS calculation formatted in standard decibels relative to full scale (dBFS).
- **Non-Destructive Editing**: Buffer slicing with cosine/equal-power crossfade smoothing to eliminate audible clicks.
