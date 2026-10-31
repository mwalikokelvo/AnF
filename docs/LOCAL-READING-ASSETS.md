# Local reading assets

Lora (serif) and Atkinson Hyperlegible (sans) are bundled with SIL OFL licenses,
available under Settings → Reading fonts → Bundled font licenses on both platforms.
Import licensed TTF/OTF/WOFF/WOFF2 files there; imports stay in this device's
IndexedDB, outside project backup/sync, with a 10 MB/file and 20-font limit.
Remove imported fonts clears these copies and keeps bundled defaults.

The independently implemented `scripts/extract-licensed-fonts.mjs` follows
[adobe-font-extractor](https://github.com/lucaschultz/adobe-font-extractor)'s
local-cache-copy approach. Its pinned review is in `assets/extractor-review.json`.
No upstream source was copied. It accepts an explicit cache, requires `--licensed`,
checks font signatures and bounds, skips symlinks, hashes output names and refuses
source/destination overlap or manifest overwriting. Example:

```
node scripts/extract-licensed-fonts.mjs --licensed PATH_TO_LICENSED_CACHE NEW_OUTPUT_FOLDER
```

This copies existing local fonts; no font activation/download or license grant is
implied. Do not redistribute proprietary Adobe fonts in public releases.

## Private custom voice pack (Windows CPU)

Amazing Voice and Always & Forever are real reference-conditioned synthesis
providers. They require a separately installed **private** local voice pack;
neither original recording nor reference clips belongs in Git/public releases.
The engine is Chatterbox Nano, model commit
`71ccd1d0081b430592cea481f4307e764e07bc64`, official demo source commit
`647b4e895d3483995e5a6546999aa5e50490b92b`. Safetensors are used for weights;
no arbitrary pickle checkpoint is downloaded. Perth watermarking remains enabled.

Provision once in an authorized network session using Python 3.12, official CPU
torch/torchaudio 2.6.0 and `scripts/voice-requirements.txt`. Run:

```
python scripts/prepare-local-voices.py --destination PUBLIC_ASSET_FOLDER
python scripts/install-local-voices.py --assets PUBLIC_ASSET_FOLDER --destination NEW_PRIVATE_PACK --ffmpeg FFMPEG_EXE --amazing "Amazing Voice.m4a" --always-forever "Always&Forevers Voice.m4a"
```

The installer copies a relocatable interpreter and dependencies, takes 12-second
mono reference excerpts starting five seconds into each original, verifies actual
new-text synthesis for **both** voices with sockets disabled, and writes
`ready.json` only on success. Originals remain unchanged. The pack includes local
integrity hashes and proof WAVs/logs; it is several GB and optional to avoid the
NSIS installer size limit. Private references must be handled with the same care
as originals. The pack is Windows-specific, not an Android executable.

Place the full pack at `local-voice` beside AnF.exe, inside the application's
resource folder, or inside the AnF local data folder. In Settings choose Refresh
reading assets, then explicitly select the custom voice in Documents. Missing or
incomplete packs disable both options with an explanation; installed local device
voices stay available for explicit selection. Android displays the named custom
voices as unavailable and uses its installed local TTS when selected. No cloud
fallback or background model download occurs.

Each request runs a CPU process, so initial synthesis can take time and roughly
2–3 GB RAM. A 240-second timeout, one native job, 600-codepoint native input limit,
90-second/5-MB audio limits and automatic generated-output cleanup bound jobs.
Long reader sentences are split at safe UTF-16 boundaries into at most 500-unit
parts, generated and played sequentially. Speed changes affect actual audio
playback. Stop/navigation cancels the native process and discards stale replies.
Pause uses the reader's explicit stop-and-restart-sentence behavior. No engine
word timestamps exist: highlighting uses the exact active sentence, never invented
word timings. `onEnd` follows actual playback completion, not generation.

The worker sets offline Hugging Face flags, private cache directories and denies
socket connections. All synthesis payloads travel through stdin. Native commands
are restricted to the workspace window, registered voice IDs and bounded input;
the UI cannot choose executable/model/output paths. Runtime integrity failures are
visible and require repairing the pack or choosing an installed voice.

## Additional licensed voice previews

The three additional user-authorized MP3 previews register as Burt Reynolds preview (deep, smooth and clear), Serafina preview, and Kelvin Mwamburi Mwaliko preview. These labels identify the supplied previews; no verified identity claim is made. They use the same local engine and real new-text proof requirements.

Use `python scripts/extend-local-voices.py --destination PRIVATE_PACK --ffmpeg FFMPEG_EXE --reference "burt-preview=LOCAL_MP3" --reference "serafina-preview=LOCAL_MP3" --reference "kelvin-preview=LOCAL_MP3"`. The existing verified pack is preserved; extensions refuse overwriting references. Previews begin at zero, capped at 12 seconds. Kelvin is about 4.08 seconds, below the engine's greater-than-five-second requirement, so its waveform is repeated once solely as the conditioning reference. This transformation and original hashes are recorded privately in ready.json; originals are unchanged. All five options require a complete verified five-voice pack.
