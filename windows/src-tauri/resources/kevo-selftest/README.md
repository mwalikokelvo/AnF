# Kevo self-test clips

Synthetic voices for Kevo's self-test (`docs/kevo-briefs/phase-0.md`, step 0.4a): 16 kHz mono 16-bit WAV files, listed with their words and expected result in `clips.json`. No real person's voice or recording is in here.

Remake them with `python3 scripts/make-kevo-selftest-clips.py` (needs `pip install piper-tts==1.8.0` and ffmpeg). Check them with `python3 scripts/make-kevo-selftest-clips.py --check`.

- `request`: the step 0.5 requests, in two voices. `checks` in `clips.json` gives their order per check; the later clips of a check come inside the follow-up window.
- `wake`: 20 "Kevo" and "Hey, Kevo" clips in five LibriTTS-R voices, said both "KEE-vo" and "KEH-vo" (`note`). The voices were picked for clarity with an independent listener (Whisper small.en heard all 8 test clips of each as the name), never by the keyword spotter.
- `lookalike`: 10 words that sound a bit like "Kevo" and must not wake it.

Voices: [Piper](https://github.com/rhasspy/piper) voice models trained on
- LJ Speech (public domain): voice `ljspeech`
- LibriTTS-R by Koizumi et al. (CC BY 4.0, http://www.openslr.org/141/): voices `libritts-*`

The generator feeds Piper phonemes, with a short pause first: given plain text, Piper dropped or garbled the first consonant ("Kevo" came out as "Pivo" or "Heevo").
