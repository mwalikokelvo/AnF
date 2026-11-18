# fish-audio (bundled skills)

Source: https://github.com/fishaudio/fish-audio-plugin at commit `6e18251`, path `plugins/fish-audio/`. Licence: MIT (see `vendor/LICENSES.md`).
14 files bundled unchanged. Read one with `python3 scripts/vendor.py fish-audio <path>`; restore them with `python3 scripts/vendor.py --export <dir> --source fish-audio`.

Not bundled: `assets/icon.svg (excluded)`, `assets/logo.png (excluded)`

<!-- vendor-file: .claude-plugin/plugin.json -->
{
  "name": "fish-audio",
  "displayName": "Fish Audio",
  "version": "0.1.7",
  "description": "Generate lifelike speech, find and clone voices, transcribe audio, produce multi-speaker audiobooks and podcasts, generate images and video, and write code against the Fish Audio API.",
  "author": {
    "name": "Fish Audio",
    "url": "https://fish.audio"
  },
  "homepage": "https://docs.fish.audio",
  "repository": "https://github.com/fishaudio/fish-audio-plugin",
  "license": "MIT",
  "keywords": [
    "text-to-speech",
    "tts",
    "voice-cloning",
    "speech-to-text",
    "audiobook",
    "podcast",
    "audio"
  ]
}

<!-- /vendor-file -->

<!-- vendor-file: .codex-plugin/plugin.json -->
{
  "name": "fish-audio",
  "version": "0.1.7",
  "description": "Generate lifelike speech, find and clone voices, transcribe audio, produce multi-speaker audiobooks and podcasts, generate images and video, and write code against the Fish Audio API.",
  "author": {
    "name": "Fish Audio",
    "url": "https://fish.audio"
  },
  "homepage": "https://docs.fish.audio",
  "repository": "https://github.com/fishaudio/fish-audio-plugin",
  "license": "MIT",
  "keywords": [
    "text-to-speech",
    "tts",
    "voice-cloning",
    "speech-to-text",
    "audiobook",
    "podcast",
    "audio"
  ],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "interface": {
    "displayName": "Fish Audio",
    "shortDescription": "Generate speech, clone voices",
    "longDescription": "Turn text into lifelike speech with voices from the Fish Audio library, clone a voice from a short sample, transcribe recordings, and produce multi-speaker audiobooks and podcasts in Story Studio, all with your Fish Audio account. Results play inline. Also generates images and video, and helps you write code against the Fish Audio SDKs and API.",
    "developerName": "Fish Audio",
    "category": "Creativity",
    "capabilities": [
      "Interactive",
      "Read",
      "Write"
    ],
    "websiteURL": "https://fish.audio",
    "supportURL": "https://fish.audio/support/",
    "privacyPolicyURL": "https://fish.audio/privacy/",
    "termsOfServiceURL": "https://fish.audio/terms/",
    "defaultPrompt": [
      "Read this paragraph aloud in a warm narrator voice",
      "Clone my voice from a recording",
      "Turn this story into a multi-voice audiobook"
    ],
    "composerIcon": "./assets/icon.svg",
    "logo": "./assets/logo.png",
    "screenshots": []
  }
}

<!-- /vendor-file -->

<!-- vendor-file: .mcp.json -->
{
  "mcpServers": {
    "fish-audio": {
      "type": "http",
      "url": "https://api.fish.audio/mcp"
    }
  }
}

<!-- /vendor-file -->

<!-- vendor-file: LICENSE -->
MIT License

Copyright (c) 2026 Fish Audio

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

<!-- /vendor-file -->

<!-- vendor-file: README.md -->
# Fish Audio

Turn text into lifelike speech, find and clone voices, transcribe recordings, and produce multi-speaker audiobooks and podcasts with your [Fish Audio](https://fish.audio) account, without leaving the conversation. The same connector also generates images and video.

## Use it

Connect the Fish Audio connector when you install the plugin and sign in with your Fish Audio account. Then ask in plain language:

- "Read this paragraph aloud in a warm narrator voice."
- "Find a calm Japanese female voice and say this line with it."
- "Clone my voice from this recording."
- "Transcribe this interview."
- "Turn this short story into an audiobook with a different voice for each character."

Generated audio plays inline where the app supports it, and you always get a permanent link. In Claude Code and Codex, the agent can save the file into your project.

The plugin also includes two skills for developers: `fish-audio-sdk` for code that uses the official Python and JavaScript SDKs, and `fish-audio-api` for raw REST and WebSocket calls.

## Credits

Generating speech, transcribing, and generating images, video, or Studio audio spend credits from your Fish Audio plan. Searching voices, editing Studio projects, cloning a voice, and price estimates are free. For larger jobs the assistant shows the cost and waits for your approval before spending.

## Data

The plugin sends the text, audio, and prompts you ask it to process to Fish Audio at `api.fish.audio`, under the account you signed in with. Voices you clone and Studio projects you create are saved to that account. Uploaded files are deleted after 7 days. See the [privacy policy](https://fish.audio/privacy/) and [terms of service](https://fish.audio/terms/).

The connector signs in with OAuth, so the plugin never reads an API key or other credential from your machine on its own. The `fish-audio-sdk` and `fish-audio-api` skills write code for your project that reads a Fish Audio API key from the `FISH_API_KEY` environment variable and sends it only to `api.fish.audio`. That happens only when you run that code, or ask the agent to run it or one of the skills' `curl` examples.

## Support

[fish.audio/support](https://fish.audio/support/) · [Documentation](https://docs.fish.audio)

<!-- /vendor-file -->

<!-- vendor-file: skills/fish-audio/SKILL.md -->
---
name: fish-audio
description: Use the Fish Audio connector to turn text into lifelike speech, find or clone voices, transcribe recordings, produce multi-speaker audiobooks and podcasts in Story Studio, and generate images or video. Use when the user asks to read something aloud, make a voiceover, narration or audio file, pick a voice, clone a voice from a sample, transcribe or caption audio, turn a script, story or book into audio, or create images or video with Fish Audio. For writing code against the Fish Audio API, use fish-audio-sdk or fish-audio-api instead.
---

# Fish Audio

The Fish Audio connector (MCP server `https://api.fish.audio/mcp`) does the work. Its tool descriptions and the `instructions` field in its responses cover each call; follow them. This skill covers what they leave to you: choosing a voice, keeping spending visible, getting files in and out, and handing results back.

If no Fish Audio tools are available, the connector isn't connected. Tell the user to connect it (claude.ai and Cowork: the plugin's **Connectors** tab; Claude Code: `/mcp`; Codex CLI: `codex mcp login fish-audio`; ChatGPT and the Codex app: sign in when prompted) and stop.

## Spending

Most tools spend the user's Fish Audio credits.

- Speech costs 1 credit per UTF-8 byte of text, so Chinese, Japanese and Korean cost about three times as much per character as English. Voices professionally cloned by another team cost double.
- Transcription costs 50 credits per second of audio on `pro`, 500 per minute on `flash`.
- Images, video, and Story Studio generation and export each have an estimate, quote or `dry_run` step. Always run it first, show the user the number, and wait for their go-ahead.

A few sentences of speech need no confirmation. For more than about a page of text, say roughly what it will cost before generating. When a job might not fit, or a tool reports an insufficient balance, call `get_credit_balance`; top-ups are at https://fish.audio/go-premium/.

## Choose a voice

- A voice the user names or links: resolve it with `search_voices` (title keywords) or `get_voice` (the id in a `https://fish.audio/m/<id>/` link).
- The user's own and cloned voices: `search_voices` with `self=true`.
- Otherwise browse `search_voices` with the text's `language` and no query, or search title keywords. Offer three to five candidates and let the user pick, unless they asked you to choose. Chat apps render the results as playable voice cards.
- Omitting `voice_id` uses a curated default voice for `language`, which is fine for a quick test.
- Use the same `voice_id` for every part of one piece.

## Generate speech

- Write for the ear. `studio_enhance_text` (free) spells out numbers, dates and symbols and adds delivery tags; use it when the text has those or should sound expressive, and keep the user's wording when they want it read verbatim.
- Delivery tags such as `[whispering]`, `[excited]`, `[laughing]` and `[pause]` are performed, never spoken. Use them sparingly.
- Keep each `text_to_speech` call under about 2,000 characters and within the plan's per-call limit (`tts_max_text_bytes_per_call` from `get_credit_balance`; 500 bytes on the free plan). Split longer text at paragraph or sentence boundaries and generate the parts in order.
- For chapters, books, scripts with several speakers, or anything the user will want to revise line by line, use Story Studio instead of chunking by hand.
- A failed or timed-out call can be retried once, identically, within 5 minutes at no charge.

## Deliver results

`text_to_speech` returns a permanent MP3 URL.

- In chat apps the audio plays inline; also give the link.
- With a shell (Claude Code, Codex), save it where the user wants it: `curl -fsSL -o narration.mp3 "<audio_url>"`. For a multi-part piece that should be one file, join the parts with `ffmpeg -f concat` if ffmpeg is installed; otherwise save numbered parts and say so.

## Local and attached audio

Transcription, cloning and document import take public https URLs. A file that is already at a public https URL can be passed as is. For anything else, call `get_upload_url` with the file name and follow its `instructions`: with a shell, `curl -fsS -X PUT --upload-file <path> "<upload_url>"`; in web chat, where you can't upload, send the user `web_upload_url` and continue once they confirm. Then pass `file_url` on.

## Clone a voice

- Ask whether the user owns the voice or has the speaker's permission. Set `confirm_voice_rights` to true only after they say yes.
- Samples: one to five files of clean speech from one speaker, 10 to 60 seconds in total works best.
- The response may report quality warnings or require speaker verification instead of creating the voice. Show the warnings and let the user choose between continuing (`proceed_despite_warnings` with the `preflight_id`) and new samples. For verification, the speaker records the exact prompt sentence, which you upload and pass to `verify_voice_clone`.
- Ask whether the voice should be `private` (this workspace only) or `unlist` (anyone with the link, the default).
- Once it exists, offer a short test line in the new voice.

## Transcribe

`pro` (the default) is the most accurate and takes a `language` hint; `flash` is about six times cheaper and suits long or rough recordings. Files are limited to 20 MB. With a shell, save long transcripts to a file rather than pasting them.

## Story Studio

Call `studio_help` before the first Studio operation in a conversation. It is the manual for projects, editing, tags, billing, errors and the audiobook and podcast workflows, and it stays current with the tools. Changes appear live in the user's Studio editor on fish.audio.

## Images and video

List the user's workspaces, pick a model with `list_media_models` and `get_media_model`, estimate, get the user's approval of the credits, then generate with exactly the estimated parameters and poll until the result is ready. Each response's `instructions` field names the next step.

## Feedback

When a tool surprises you, fails confusingly, or takes more steps than it should, send one short note with `submit_feedback`.

<!-- /vendor-file -->

<!-- vendor-file: skills/fish-audio-api/SKILL.md -->
---
name: fish-audio-api
description: Write direct HTTP / WebSocket calls to the Fish Audio platform (TTS, ASR, voice design, voice models, wallet, real-time TTS streaming) without depending on the Python or JavaScript SDK. Use when the user asks to call Fish Audio from curl, a language without an official SDK, an edge/runtime environment that cannot install the SDK, or when they explicitly want raw REST / WebSocket code. Covers authentication, endpoint URLs, required headers, request / response schemas, MessagePack vs JSON vs multipart encoding rules, multi-speaker dialogue, voice-design candidate generation, and the WebSocket streaming protocol.
---

# Fish Audio Raw API Skill

Use this skill to generate correct, runnable Fish Audio API calls without any SDK. The canonical machine-readable sources are:

- REST: `https://docs.fish.audio/api-reference/openapi.json`
- WebSocket: `https://docs.fish.audio/api-reference/asyncapi.yml`

This file condenses those into rules an agent can apply directly.

## Global facts

- Base URL: `https://api.fish.audio`
- WebSocket base: `wss://api.fish.audio`
- Auth (all endpoints): `Authorization: Bearer <FISH_API_KEY>`
- Optional distributed tracing for inference APIs: see `https://docs.fish.audio/api-reference/observability`.
- Get API keys: `https://fish.audio/app/api-keys`
- Never hardcode keys. Read from an env var like `FISH_API_KEY`.
- Errors are JSON with at least `{status, message}` (for example 401 / 402 / 404 / 429). Speech-to-text errors from `transcribe-1-pro` also carry `code` and `request_id`. Errors from the network edge in front of the API (some 413 and 5xx responses) may not be JSON. `422` validation errors, on the endpoints that return them, are an array of `{loc, type, msg, ctx, in}`.

## Endpoint map

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/tts` | Text-to-Speech (streams audio bytes) |
| POST | `/v1/asr` | Speech-to-Text (returns JSON transcript) |
| POST | `/v1/voice-design` | Voice Design (returns generated voice candidates) |
| GET | `/model` | List voice models |
| POST | `/model` | Create voice model (voice cloning) |
| GET | `/model/{id}` | Get voice model metadata |
| PATCH | `/model/{id}` | Update voice model |
| DELETE | `/model/{id}` | Delete voice model |
| GET | `/wallet/{user_id}/package` | Subscription package info (`user_id` defaults to `self`) |
| GET | `/wallet/{user_id}/api-credit` | API credit balance (`user_id` defaults to `self`) |
| WSS | `/v1/tts/live` | Real-time TTS streaming (MessagePack frames) |

## Text-to-Speech: `POST /v1/tts`

Required headers:

- `Authorization: Bearer <FISH_API_KEY>`
- `Content-Type: application/json` **or** `application/msgpack`

Optional headers:

- `model`: values `s1` (deprecated), `s2-pro`, `s2.1-pro`, `s2.1-pro-free`, `drama-3`. If omitted or unrecognized, the server falls back to `s2.1-pro` (paid). Default to `s2.1-pro` for production; use `s2.1-pro-free` for free-tier evaluation and prototyping (same model, no TTFA/DPA guarantees). Do not choose `s1` for new code: S1 is deprecated and will be retired on December 31, 2026. After that date, requests that specify `s1` are served by `s2.1-pro`. Migration: `https://docs.fish.audio/developer-guide/models-pricing/migrate-from-s1`.

Response: streaming audio bytes (`Transfer-Encoding: chunked`) in the format set by `format`. Write to a file or pipe to a player. There is **no JSON wrapper** on success.

### Request body fields (TTSRequest)

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `text` | string | — (required) | The text to synthesize. Use speaker tags `<\|speaker:0\|>`, `<\|speaker:1\|>` for multi-speaker. |
| `reference_id` | string \| string[] \| null | null | Voice model ID. Array = multi-speaker (`s2-pro`, the S2.1-Pro family, and `drama-3`). |
| `references` | ReferenceAudio[] \| ReferenceAudio[][] \| null | null | Inline zero-shot cloning samples. **Requires `application/msgpack`** because `audio` is raw bytes. 2D array for multi-speaker. |
| `temperature` | number 0–1 | 0.7 | Expressiveness. |
| `top_p` | number 0–1 | 0.7 | Nucleus sampling. |
| `prosody.speed` | number 0.5–2 | 1 | Playback speed. |
| `prosody.volume` | number (dB) | 0 | Loudness offset. |
| `prosody.normalize_loudness` | bool | true | **`s2-pro` and the S2.1-Pro family.** |
| `chunk_length` | int 100–300 | 300 | Text segment size. |
| `min_chunk_length` | int 0–100 | 50 | Min chars before a new chunk. |
| `normalize` | bool | true | Spell out numbers, dates, units and symbols before synthesis. Uses `language` when set, otherwise detects the language per chunk. |
| `language` | string \| null | null (auto) | BCP-47 tag of the text, e.g. `en`, `es-MX`, `zh-CN`, `zh-TW`. Case-insensitive; `_` = `-`. Only affects normalization and word timestamps; never the voice, accent or audio quality. Omit, `""` or `"auto"` = detect per chunk. Tags without normalization rules skip normalization (no error); tag list: `https://docs.fish.audio/features/text-to-speech#supported-normalization-languages`. Spanish without a region uses Spain conventions; `es-MX` for Mexican readings. Leave unset for mixed-language text. With `normalize: false`, only word timestamps use it. Over 35 chars or chars outside `[A-Za-z0-9_-]` → 400. Not in the official SDKs yet; send it in the raw body. |
| `format` | `wav` \| `pcm` \| `mp3` \| `opus` | `mp3` | Output format. |
| `sample_rate` | int \| null | null (44100, or 48000 for opus) | Output sample rate. |
| `mp3_bitrate` | 64 \| 128 \| 192 | 128 | Only when `format=mp3`. |
| `opus_bitrate` | -1000 \| 24000 \| 32000 \| 48000 \| 64000 | -1000 (auto) | Opus bitrate in **bps**. Only when `format=opus`. |
| `latency` | `low` \| `normal` \| `balanced` | `normal` | Quality vs latency. |
| `max_new_tokens` | int | 1024 | Per-chunk audio token cap. |
| `repetition_penalty` | number | 1.2 | >1.0 reduces repeats. |
| `condition_on_previous_chunks` | bool | true | Cross-chunk voice consistency. |
| `early_stop_threshold` | number 0–1 | 1.0 | Batch early-stop. |

`ReferenceAudio` = `{ audio: <raw bytes>, text: <transcript string> }`. 10–30 s of clean speech works best.

### Voice source rules

1. **Library / custom voice model** → set `reference_id` to the model `_id`. Simplest path.
2. **Zero-shot from audio** → set `references` (array of `{audio, text}`) and use **MessagePack** body. JSON cannot carry raw audio bytes.
3. **Multi-speaker dialogue (`s2-pro`, the S2.1-Pro family, and `drama-3`)** → `reference_id: [id0, id1, ...]` and embed `<|speaker:0|>` / `<|speaker:1|>` markers inside `text`. For zero-shot multi-speaker, `references` is an array-of-arrays, one inner array per speaker.

### Single-speaker curl

```bash
curl --request POST https://api.fish.audio/v1/tts \
  --header "Authorization: Bearer $FISH_API_KEY" \
  --header "Content-Type: application/json" \
  --header "model: s2.1-pro" \
  --data '{
    "text": "Hello! Welcome to Fish Audio.",
    "reference_id": "<voice-model-id>",
    "format": "mp3",
    "mp3_bitrate": 128,
    "latency": "normal"
  }' \
  --output out.mp3
```

### Multi-speaker curl

```bash
curl --request POST https://api.fish.audio/v1/tts \
  --header "Authorization: Bearer $FISH_API_KEY" \
  --header "Content-Type: application/json" \
  --header "model: s2.1-pro" \
  --data '{
    "text": "<|speaker:0|>Good morning!<|speaker:1|>Good morning! How are you?",
    "reference_id": ["<speaker-0-id>", "<speaker-1-id>"],
    "format": "mp3"
  }' \
  --output dialogue.mp3
```

### Python (no SDK, streaming to file)

```python
import os, httpx

payload = {
    "text": "Hello from Fish Audio.",
    "reference_id": "<voice-model-id>",
    "format": "mp3",
    "latency": "normal",
}

headers = {
    "Authorization": f"Bearer {os.environ['FISH_API_KEY']}",
    "Content-Type": "application/json",
    "model": "s2.1-pro",
}

with httpx.stream("POST", "https://api.fish.audio/v1/tts",
                  headers=headers, json=payload, timeout=None) as r:
    r.raise_for_status()
    with open("out.mp3", "wb") as f:
        for chunk in r.iter_bytes():
            f.write(chunk)
```

### Python with inline references (MessagePack)

```python
import os, httpx, msgpack

with open("sample.wav", "rb") as f:
    ref_audio = f.read()

payload = {
    "text": "Clone this voice and say this line.",
    "references": [{"audio": ref_audio, "text": "Transcript of sample.wav."}],
    "format": "mp3",
}

headers = {
    "Authorization": f"Bearer {os.environ['FISH_API_KEY']}",
    "Content-Type": "application/msgpack",
    "model": "s2.1-pro",
}

body = msgpack.packb(payload, use_bin_type=True)
with httpx.stream("POST", "https://api.fish.audio/v1/tts",
                  headers=headers, content=body, timeout=None) as r:
    r.raise_for_status()
    with open("out.mp3", "wb") as f:
        for chunk in r.iter_bytes():
            f.write(chunk)
```

### Node.js (fetch, streaming)

```js
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const res = await fetch("https://api.fish.audio/v1/tts", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.FISH_API_KEY}`,
    "Content-Type": "application/json",
    model: "s2.1-pro",
  },
  body: JSON.stringify({
    text: "Hello from Fish Audio.",
    reference_id: "<voice-model-id>",
    format: "mp3",
    latency: "normal",
  }),
});

if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
await pipeline(Readable.fromWeb(res.body), createWriteStream("out.mp3"));
```

## Speech-to-Text: `POST /v1/asr`

Synchronous: one audio file per request, and the JSON response arrives when the whole file has been transcribed.

Use `transcribe-1-pro`, the recommended model, and select it with the `model` header on every request. This section describes `transcribe-1-pro`; for the differences on `transcribe-1`, see "If you use `transcribe-1`" at the end of this section.

Guide: `https://docs.fish.audio/features/speech-to-text`. The `/v1/asr` entry in `openapi.json` currently does not list the `transcribe-1-pro` fields, `request_id`, `speaker_turns`, or the error `code`; where it is less complete or disagrees, follow this section.

Headers:

- `Authorization: Bearer <FISH_API_KEY>` (required).
- `model: transcribe-1-pro` (recommended): recordings up to 60 minutes, including multi-speaker conversations, with speaker markers, `speaker_turns`, and emotion and vocal-event cues. Write the value exactly, in lowercase. The header is optional, but a missing or unrecognized value (for example `Transcribe-1-Pro` or `transcribe-1pro`) is served and billed as `transcribe-1`, and no error is returned; if you expected Pro but `text` has no speaker markers and you did not send `diarize=false`, check the header. `model` is a header only; a `model` form field is ignored.
- Body encoding: `multipart/form-data` (let the HTTP client set `Content-Type` and the boundary) or `Content-Type: application/msgpack`. Base64-encoded audio in a JSON body is not supported.

Request fields (the same names in multipart and MessagePack):

| Field                          | Default      | Notes                                                                                                                                                                                                                                           |
| ------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audio`                        | — (required) | Exactly one audio file: a multipart file part, or MessagePack `bin`. The format is read from the bytes, not the file name.                                                                                                                      |
| `language`                     | unset        | Optional hint, a lowercase ISO 639-1 code such as `en`, `zh`, or `ja`. Detection still runs, and the hint does not force the transcript language. Other forms, such as `en-US` or `English`, may be rejected with 400.                          |
| `ignore_timestamps`            | `true`       | `false` returns word-level `segments` and, unless `diarize=false`, `speaker_turns`; it adds processing time. Multipart: any value other than `true` (case-insensitive), including `1` or an empty value, means `false`. MessagePack: a boolean. |
| `tag_audio_events`             | `true`       | `false` removes bracketed cues such as `[laughter]` or `[高兴]` from `text` and `speaker_turns`. Timestamps, `duration`, and billing do not change.                                                                                             |
| `diarize`                      | `auto`       | `auto` or `true`: return `speaker_turns` when timestamps are requested. `false`: omit `speaker_turns` and the speaker markers in `text`; the rest of the transcript does not change.                                                                                    |
| `num_speakers`                 | unset        | Expected number of speakers, an integer ≥ 1. A best-effort hint that may have no effect on short recordings. Cannot be combined with `min_speakers` or `max_speakers`.                                                                          |
| `min_speakers`, `max_speakers` | unset        | Bounds on the number of speakers, integers ≥ 1, with `min_speakers` ≤ `max_speakers`. Same best-effort rule.                                                                                                                                    |

Multipart values: `tag_audio_events` is `true` or `false` and `diarize` is `auto`, `true`, or `false` (both case-insensitive); speaker counts are digits. MessagePack values: `tag_audio_events` is a boolean, `diarize` is a boolean or `"auto"`/`"true"`/`"false"`, and speaker counts are integers. An invalid value, `tag_audio_events`, `diarize`, or a speaker count sent twice in a multipart form, or a speaker count with `diarize=false` returns 400 `invalid_parameter`.

Limits and formats:

- `transcribe-1-pro` accepts recordings up to 60 minutes; longer audio returns 400 `audio_too_long`. Send long recordings as compressed audio (MP3, Opus, or AAC); an hour of 128 kbps MP3 is about 55 MiB. A request that is too large returns 413. Send a whole conversation as one file: speaker labels are consistent within one response, not across requests.
- Processing time grows with the length of the recording, and long `transcribe-1-pro` requests can take several minutes. Set a generous client timeout (the examples use 15 minutes); many HTTP libraries default to much less (httpx: 5 s). If a long request fails with a 5xx error or the connection drops, retry it.
- `transcribe-1-pro` accepts WAV, MP3, AAC (including M4A/MP4), FLAC, Ogg (Opus or Vorbis), WebM/Matroska, and MOV, including browser recordings, and uses the first audio track of a video file; send the original file bytes. AIFF, CAF, WMA, AMR, AC-3, and raw (headerless) PCM return 400.

Response (200), an illustrative `transcribe-1-pro` response with `ignore_timestamps=false`:

```json
{
  "text": "<|speaker:0|> Thanks for joining. <|speaker:1|> [laughter] Happy to be here.",
  "duration": 4.2,
  "segments": [
    { "text": "Thanks", "start": 0.16, "end": 0.48 },
    { "text": "for", "start": 0.48, "end": 0.64 },
    { "text": "joining", "start": 0.64, "end": 1.12 },
    { "text": "Happy", "start": 2.24, "end": 2.56 },
    { "text": "to", "start": 2.56, "end": 2.68 },
    { "text": "be", "start": 2.68, "end": 2.8 },
    { "text": "here", "start": 2.8, "end": 3.2 }
  ],
  "language": "English",
  "language_code": "en",
  "request_id": "3f6c2a1e-8b4d-4c7a-9e21-5d0b7f9a6c13",
  "speaker_turns": [
    {
      "speaker": "speaker:0",
      "text": "Thanks for joining.",
      "start": 0.16,
      "end": 1.12
    },
    {
      "speaker": "speaker:1",
      "text": "[laughter] Happy to be here.",
      "start": 2.24,
      "end": 3.2
    }
  ]
}
```

Response fields:

- `text`: The full transcript, with inline `<|speaker:N|>` markers (none with `diarize=false`), usually with a space on each side, and, unless `tag_audio_events=false`, bracketed cues. Text before the first marker belongs to the first turn; unless `diarize=false` was sent, a transcript with no marker is a single speaker (speaker 0).
- `duration`: Audio length in seconds, including silence.
- `segments`: Word-level timestamps `{ text, start, end }` in seconds. Usually one word (one or a few characters in Chinese and Japanese), with no punctuation, markers, or cues; it can be normalized (`35` for `3.5`), so it does not always match `text`. `start` can equal `end`. `[]` (never omitted) when `ignore_timestamps=true`, when no speech was found, or when timing is temporarily unavailable. Segments are not speaker turns.
- `language`: The detected language's English name, such as `English` or `Chinese`. Omitted when it cannot be determined.
- `language_code`: ISO 639-1 code for `language`, such as `en`. Omitted when unknown. If the language cannot be determined and you sent a `language` hint, it reports your hint, unchecked. Responses report one language, even for recordings that switch languages.
- `request_id`: Unique ID for the request, also in error bodies and in the `x-request-id` response header. Include it when you contact support.
- `speaker_turns`: Present only when `ignore_timestamps=false` and `diarize` is not `false`. Turns in the order they occur (`[]` when no speech was found), each `{ speaker: "speaker:N", text, start, end }`. `N` matches the `<|speaker:N|>` marker in `text`; labels identify speakers within one response only. Turn `text` has no markers and keeps cues unless `tag_audio_events=false`. If `segments` is empty, turn times are approximate and can cover the whole recording. Consecutive turns can have the same speaker; do not assume turns are contiguous or non-overlapping. Prefer `speaker_turns` over parsing `text`.

`language` and `language_code` are omitted, never `null`. Do not depend on the order of keys in the JSON.

### curl

```bash
curl --request POST https://api.fish.audio/v1/asr \
  --header "Authorization: Bearer $FISH_API_KEY" \
  --header "model: transcribe-1-pro" \
  --form "audio=@input.wav" \
  --form "ignore_timestamps=false"
```

### Python

```python
import os, httpx

with open("input.wav", "rb") as f:
    r = httpx.post(
        "https://api.fish.audio/v1/asr",
        headers={
            "Authorization": f"Bearer {os.environ['FISH_API_KEY']}",
            "model": "transcribe-1-pro",
        },
        files={"audio": f},
        data={"ignore_timestamps": "false"},
        # Long Pro recordings can take several minutes; httpx defaults to 5 s.
        timeout=httpx.Timeout(900.0, connect=10.0),
    )
if r.is_error:
    try:
        err = r.json()  # {status, message}; transcribe-1-pro adds code, request_id
    except ValueError:
        err = {"status": r.status_code, "message": r.text}  # edge errors may not be JSON
    raise RuntimeError(f"ASR failed: {err}")
result = r.json()
print(result["text"])
for turn in result.get("speaker_turns", []):
    print(f"{turn['speaker']} [{turn['start']:.2f}-{turn['end']:.2f}] {turn['text']}")
```

### Node.js (fetch)

```js
import { readFile } from "node:fs/promises";
// npm install undici@7 (Node.js 20.18.1+; undici 8 needs Node.js 22.19+)
import { Agent, setGlobalDispatcher } from "undici";

// Node's fetch waits only 300 s for response headers; long Pro requests can take longer.
setGlobalDispatcher(
  new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 })
);

const form = new FormData();
form.append("audio", new Blob([await readFile("input.wav")]), "input.wav");
form.append("ignore_timestamps", "false");

const res = await fetch("https://api.fish.audio/v1/asr", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.FISH_API_KEY}`,
    model: "transcribe-1-pro",
  },
  body: form,
  signal: AbortSignal.timeout(900_000),
});
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
const result = await res.json();
console.log(result.text);
for (const turn of result.speaker_turns ?? []) {
  console.log(`${turn.speaker} [${turn.start}-${turn.end}] ${turn.text}`);
}
```

MessagePack instead of multipart: send `msgpack.packb({"audio": audio_bytes, "ignore_timestamps": False}, use_bin_type=True)` with `Content-Type: application/msgpack` and the same `model: transcribe-1-pro` header; values are typed (booleans, integers), and `audio` must be raw bytes (`bin`).

### If you use `transcribe-1`

`transcribe-1` is for general transcription of short recordings, and it serves every request whose `model` header is missing or not an exact match. It differs from `transcribe-1-pro` as follows:

- Fields: send only `audio`, `language`, and `ignore_timestamps`. The other fields apply to `transcribe-1-pro`; send them only with `model: transcribe-1-pro`.
- Response: `text`, `duration`, `segments`, and, when the language is known, `language` and `language_code`. Speaker markers, `speaker_turns`, and `request_id` are `transcribe-1-pro` features.
- Errors: rely only on `status` and `message`.
- Limits: up to 50 MiB per request; keep MP3 and Opus files under 25 MiB. A request over the size limit returns 413 or 400. For recordings longer than a few minutes, use `transcribe-1-pro`. A long request can fail with 503 when it exceeds the processing-time limit; retry, and if it keeps failing, use `transcribe-1-pro` or split the audio.
- Formats: WAV, MP3, AAC (including M4A/MP4), FLAC, and Ogg (Opus or Vorbis). Convert WebM recordings (for example, from a browser's MediaRecorder) to Ogg/Opus, MP3, or WAV first, or use `transcribe-1-pro`.

## Voice Design: `POST /v1/voice-design`

Required headers:

- `Authorization: Bearer <FISH_API_KEY>`
- `Content-Type: application/json`
- `model: voice-design-1` (required; currently the only public Voice Design model)

Response: JSON `{ candidates: VoiceDesignCandidate[] }`. Each candidate includes `audio_base64`; decode it to write the generated audio bytes to a file. The current candidate audio payload is WAV bytes encoded as base64.

### Request body fields (VoiceDesignRequest)

| Field                     | Type           | Default      | Notes                                                                       |
| ------------------------- | -------------- | ------------ | --------------------------------------------------------------------------- |
| `instruction`             | string         | — (required) | Voice design prompt. 1 to 2000 characters.                                  |
| `reference_text`          | string \| null | null         | Optional preview text to read in the generated voice. Up to 150 characters. |
| `language`                | string \| null | null         | Optional language hint such as `en`, `zh`, or `ja`.                         |
| `n`                       | int            | 2            | Number of candidates. Range: 1 to 4.                                        |
| `speed`                   | number         | 1.0          | Speaking speed multiplier. Must be greater than 0 and at most 3.             |
| `num_step`                | int            | 32           | Diffusion steps. Range: 1 to 128.                                           |
| `guidance_scale`          | number         | 2.0          | Prompt guidance. Must be at least 0.                                        |
| `instruct_guidance_scale` | number         | 0.0          | Instruction guidance. Must be at least 0.                                   |
| `seed`                    | int \| null    | null         | Optional deterministic seed for candidate generation.                       |

Do **not** send MessagePack, multipart form data, inline reference audio, or service-internal fields such as `features`, `features_json_file`, or `include_audio_base64`.

### curl

```bash
curl --request POST https://api.fish.audio/v1/voice-design \
  --header "Authorization: Bearer $FISH_API_KEY" \
  --header "Content-Type: application/json" \
  --header "model: voice-design-1" \
  --data '{
    "instruction": "Warm, confident studio narrator with a natural tone",
    "reference_text": "Welcome to Fish Audio.",
    "language": "en",
    "n": 2
  }' | jq -r '.candidates[0].audio_base64' | base64 --decode > voice.wav
```

### Python

```python
import base64
import os
import httpx

r = httpx.post(
    "https://api.fish.audio/v1/voice-design",
    headers={
        "Authorization": f"Bearer {os.environ['FISH_API_KEY']}",
        "Content-Type": "application/json",
        "model": "voice-design-1",
    },
    json={
        "instruction": "Warm, confident studio narrator with a natural tone",
        "reference_text": "Welcome to Fish Audio.",
        "language": "en",
        "n": 2,
    },
    timeout=120,
)
r.raise_for_status()
candidate = r.json()["candidates"][0]
with open("voice.wav", "wb") as f:
    f.write(base64.b64decode(candidate["audio_base64"]))
```

Billing: one successful generation request is charged once, even when it returns multiple candidates. Authentication, validation, balance, concurrency, and service errors are not billed.

## Voice models: `/model`

### List: `GET /model`

Query params: `page_size` (default 10), `page_number` (default 1), `title`, `tag` (string or array), `self` (bool; only your models), `author_id`, `language`, `title_language`, `sort_by` (`score` | `task_count` | `created_at`, default `score`).

Returns `{total, items: ModelEntity[]}`.

### Create: `POST /model` (multipart/form-data)

Required: `type=tts`, `title`, `train_mode=fast`, `voices` (one or more audio file uploads).

Optional: `visibility` (`public` | `unlist` | `private`, default `public`; `cover_image` is required if `public`), `description`, `cover_image`, `texts` (transcripts matching each voice; if omitted, ASR is run on the audio), `tags` (string or array), `enhance_audio_quality` (bool, default `false`).

```bash
curl --request POST https://api.fish.audio/model \
  --header "Authorization: Bearer $FISH_API_KEY" \
  --form "type=tts" \
  --form "train_mode=fast" \
  --form "title=My Voice" \
  --form "visibility=private" \
  --form "voices=@sample1.wav" \
  --form "voices=@sample2.wav" \
  --form "texts=Transcript of sample 1." \
  --form "texts=Transcript of sample 2." \
  --form "tags=en" \
  --form "tags=narration"
```

Returns 201 with the full `ModelEntity` including `_id`, `state` (`created` | `training` | `trained` | `failed`), `visibility`, `samples`, `author`, counts, timestamps. Use `_id` as `reference_id` in `/v1/tts`.

### Get / Update / Delete

- `GET /model/{id}` → `ModelEntity`
- `PATCH /model/{id}`: JSON, form-urlencoded, multipart, or msgpack. Nullable fields: `title`, `description`, `cover_image` (binary), `visibility`, `tags`.
- `DELETE /model/{id}` → 200 on success.

```bash
curl --request PATCH https://api.fish.audio/model/<id> \
  --header "Authorization: Bearer $FISH_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{"title": "Renamed", "visibility": "unlist"}'
```

## Wallet

- `GET /wallet/self/package` → `{user_id, type, total, balance, created_at, updated_at, finished_at}`
- `GET /wallet/self/api-credit` → `{_id, user_id, credit, created_at, updated_at, has_phone_sha256, has_free_credit}`. Pass `?check_free_credit=true` to also populate `has_free_credit` (default `false`; the field is `null` when not checked).

Replace `self` with a specific `user_id` if you have permission; otherwise always use `self`.

## WebSocket TTS: `wss://api.fish.audio/v1/tts/live`

For low-latency / streaming TTS (e.g. LLM token stream → speech). All frames are **MessagePack-encoded** binary messages.

### Connection headers

- `Authorization: Bearer <FISH_API_KEY>`
- `model`: optional; values `s1` (deprecated, retires December 31, 2026, then served by `s2.1-pro`), `s2-pro`, `s2.1-pro`, `s2.1-pro-free`, `drama-3` (falls back to `s2.1-pro` when omitted or unrecognized)

### Event sequence

Client → server:

1. `StartEvent` (once, first message): `{event: "start", request: <TTSRequest>}`. The `request` object is the same schema as `POST /v1/tts` above. Usually `request.text = ""` and the real text streams in `TextEvent`s. `request.language`, if set, applies to the whole session.
2. `TextEvent` (one per text chunk): `{event: "text", text: "..."}`. Send as many as needed.
3. `FlushEvent` (optional): `{event: "flush"}`. Forces the server to synthesize buffered text immediately (use for turn-taking / low-latency flushes).
4. `CloseEvent` (final): `{event: "stop"}`. **Note the literal is `stop`, not `close`.**

Server → client:

- `AudioEvent`: `{event: "audio", audio: <bytes>}`. Many of these; concatenate in order to reconstruct the audio stream in the format set by `request.format`.
- `FinishEvent`: `{event: "finish", reason: "stop" | "error"}`. Exactly one, then the server closes the socket. Ignore unknown events for forward compatibility.

### Python example (`websockets>=14` + `msgpack`)

`additional_headers` is the parameter name in `websockets` v14+. On older
releases use `extra_headers=` or import from `websockets.legacy.client`.

```python
import asyncio, os, msgpack, websockets
from websockets.exceptions import ConnectionClosed

API_KEY = os.environ["FISH_API_KEY"]
URL = "wss://api.fish.audio/v1/tts/live"

start = {
    "event": "start",
    "request": {
        "text": "",
        "reference_id": "<voice-model-id>",
        "format": "mp3",
        "latency": "normal",
    },
}

async def run(text_stream):
    headers = {"Authorization": f"Bearer {API_KEY}", "model": "s2.1-pro"}
    async with websockets.connect(URL, additional_headers=headers,
                                  max_size=None) as ws:
        await ws.send(msgpack.packb(start, use_bin_type=True))

        async def sender():
            try:
                async for chunk in text_stream:
                    await ws.send(msgpack.packb(
                        {"event": "text", "text": chunk}, use_bin_type=True))
                await ws.send(msgpack.packb({"event": "stop"}, use_bin_type=True))
            except ConnectionClosed:
                pass  # server sent finish before the text stream drained

        send_task = asyncio.create_task(sender())
        try:
            with open("out.mp3", "wb") as f:
                async for raw in ws:
                    msg = msgpack.unpackb(raw, raw=False)
                    if msg["event"] == "audio":
                        f.write(msg["audio"])
                    elif msg["event"] == "finish":
                        if msg["reason"] == "error":
                            raise RuntimeError("TTS failed")
                        break
        finally:
            send_task.cancel()
            try:
                await send_task
            except (asyncio.CancelledError, ConnectionClosed):
                pass

async def words():
    for w in ["Hello", " from", " Fish", " Audio."]:
        yield w

asyncio.run(run(words()))
```

### Node.js example (`ws` + `@msgpack/msgpack`)

```js
import WebSocket from "ws";
import { encode, decode } from "@msgpack/msgpack";
import { createWriteStream } from "node:fs";

const ws = new WebSocket("wss://api.fish.audio/v1/tts/live", {
  headers: {
    Authorization: `Bearer ${process.env.FISH_API_KEY}`,
    model: "s2.1-pro",
  },
});

const out = createWriteStream("out.mp3");

ws.on("open", () => {
  ws.send(encode({
    event: "start",
    request: { text: "", reference_id: "<voice-model-id>", format: "mp3" },
  }));
  ws.send(encode({ event: "text", text: "Hello from Fish Audio." }));
  ws.send(encode({ event: "stop" }));
});

ws.on("message", (buf) => {
  const msg = decode(buf);
  if (msg.event === "audio") out.write(Buffer.from(msg.audio));
  else if (msg.event === "finish") {
    out.end();
    ws.close();
    if (msg.reason === "error") throw new Error("TTS failed");
  }
});
```

## Emotion / expression control

S2-Pro and the S2.1-Pro models use free-form `[bracket]` natural-language tags inside `text`, e.g. `[slightly sarcastic, rising tone]`; there is no separate parameter. The deprecated S1 model uses legacy `(parenthesis)` tags, e.g. `(happy) What a day!`. The API does not convert between the two, so write new code with `[bracket]` tags (S1 retires December 31, 2026). Full list: `https://docs.fish.audio/api-reference/emotion-reference.md`.

## Encoding and content-type rules

- Use `application/json` for normal TTS requests. It's the simplest and works for `reference_id` flows.
- Use `application/msgpack` when you need to send raw audio bytes inline (inline `references`, or the WebSocket protocol).
- Use `multipart/form-data` for `/v1/asr` and `POST /model` because they upload files. `/v1/asr` also accepts `application/msgpack`; it does not accept base64 audio in JSON.
- All WebSocket frames are MessagePack binary, regardless of inner payload.

## Error handling checklist

- 400 on `POST /v1/tts` → `language` is longer than 35 characters or contains characters other than letters, digits, `-` and `_`.
- 401 → missing / bad `Authorization` header.
- 402 → out of credit. Check `/wallet/self/api-credit`.
- 404 → bad `model/{id}` (voice model doesn't exist or isn't visible to you).
- 422 → validation. The response is an array; each item's `loc` points at the offending field. Most common causes:
  - `reference_id` is an array but model is `s1` (multi-speaker requires `s2-pro`, an S2.1-Pro model, or `drama-3`).
  - `references` sent with `Content-Type: application/json` (must be msgpack).
  - Numeric param out of range (`temperature`, `top_p`, `chunk_length`, `min_chunk_length`, `prosody.speed`, `early_stop_threshold`).
  - `mp3_bitrate` / `opus_bitrate` set without matching `format`.
- WebSocket: a `finish` event with `reason: "error"` means the server failed mid-stream. Surface the message and reconnect rather than retrying on the same socket.
- `POST /v1/asr` (`transcribe-1-pro`): branch on the HTTP status and on `code`, never on `message`. New `code` values may be added; handle unknown codes by HTTP status. With `transcribe-1`, rely only on `status` and `message`.
  - 400 → fix the request; do not retry. Codes: `invalid_request` (unreadable body, missing or repeated `audio`), `invalid_parameter` (bad or conflicting field values), `invalid_audio` (undecodable or unsupported format), `audio_too_long` (over 60 minutes), `audio_too_short` (under about 0.08 s).
  - 413 → request too large (`request_too_large`). It may come from the network edge without a JSON body. Send compressed audio.
  - 415 → unsupported `Content-Type` (`unsupported_media_type`). Use `multipart/form-data` or `application/msgpack`.
  - 429 → usually your account is at its concurrency limit, shared by all its API keys; each `/v1/asr` request holds a slot until its response returns. No `Retry-After` header is sent; retry with exponential backoff.
  - 500 (`internal_error`), 502, 503 (`upstream_unavailable`, `upstream_timeout`, `excessive_repetition`, `diarization_failed`), 504 → temporary; retry with exponential backoff.
  - Any other 4xx (`upstream_rejected`, rare) → do not retry.

## Decision shortcuts

- User just wants audio from text → `POST /v1/tts` with JSON + `reference_id`.
- User has a raw voice clip and wants instant cloning → `POST /v1/tts` with MessagePack + `references`.
- User wants dialogue between multiple speakers → `POST /v1/tts` on `s2.1-pro` with `reference_id` array and `<|speaker:N|>` tags.
- User is streaming tokens from an LLM and wants speech to play as it arrives → WebSocket `/v1/tts/live`.
- User wants a persistent custom voice they can reuse → `POST /model` first, then reuse the returned `_id` as `reference_id`.
- User wants a transcript → `POST /v1/asr` with the `model: transcribe-1-pro` header (send it on every request; without it, the request runs on `transcribe-1`).

<!-- /vendor-file -->

<!-- vendor-file: skills/fish-audio-sdk/SKILL.md -->
---
name: fish-audio-sdk
description: Write code with the official Fish Audio SDKs, Python (`fishaudio`, PyPI `fish-audio-sdk`) and JavaScript/TypeScript (`fish-audio`). Use when the user wants text-to-speech, speech-to-text, voice cloning / voice-model management, or realtime WebSocket TTS through the installed SDK rather than raw HTTP. Covers install and auth, sync + async Python, the TypeScript client, exact method signatures and defaults, model selection (including the S2.1 typing caveat), the real exception types, and the Python↔JavaScript naming differences. For raw REST/WebSocket calls without an SDK (curl, unsupported languages, edge runtimes), use the `fish-audio-api` skill instead.
---

# Fish Audio SDK Skill

Use this skill to generate correct, runnable code with the **official Fish Audio SDKs**:

- **Python**: package `fish-audio-sdk` on PyPI, imported as `fishaudio`. (The same wheel still ships a separate legacy `fish_audio_sdk` package. Do **not** mix them; everything here is the modern `fishaudio` package.)
- **JavaScript / TypeScript**: package `fish-audio` on npm, imported as `FishAudioClient`.

If the user wants raw `curl` / HTTP / WebSocket without installing an SDK, use the **`fish-audio-api`** skill instead.

> This file is the index. Deeper, task-specific rules and full examples live in [`references/`](references/). Read the reference for the task you're doing before writing code.

## Global facts

- **Auth:** both SDKs read the API key from the `FISH_API_KEY` environment variable automatically. Get keys at `https://fish.audio/app/api-keys`. Never hardcode a key.
- **Base URL:** `https://api.fish.audio` (override with `base_url=` in Python / `baseUrl:` in JS).
- **TTS models:** the API supports `s1` (deprecated), `s2-pro`, `s2.1-pro` (recommended for production), and `s2.1-pro-free` (free tier). Do not choose `s1` for new code: S1 is deprecated and will be retired on December 31, 2026. After that date, requests that specify `s1` are served by `s2.1-pro` (migration: `https://docs.fish.audio/developer-guide/models-pricing/migrate-from-s1`). However, the Python SDK types `model` as only `s1` and `s2-pro` (plus the deprecated `speech-1.x`), default `s2-pro`. The JS package on npm (`fish-audio` 0.1.0) types `backend` without `s2-pro` or `s2.1-pro` and defaults it to `"s1"` at runtime (its README says `"s2-pro"`), so in JS always pass `backend` explicitly. Both SDKs forward the model value without runtime validation, so `"s2.1-pro"` works over the wire. Static type checkers will flag it, so add `# type: ignore` (Python) / an `as` cast (TS), or use the `fish-audio-api` skill for raw calls. `speech-1.5` / `speech-1.6` are **deprecated**. In Python pass `model="s2-pro"` (keyword); in JS pass the **positional** `backend` argument.
- **ASR models:** use `transcribe-1-pro` (recommended: speaker turns, long recordings, emotion cues). Neither SDK has an ASR `model` argument: send the `model: transcribe-1-pro` HTTP header on every request (Python `RequestOptions(additional_headers=...)`, JS `requestOptions.headers`). A request without it is served and billed as `transcribe-1`, the model for short recordings. See [references/speech-to-text.md](references/speech-to-text.md).
- **Audio formats:** `mp3` (default), `wav`, `pcm`, `opus`.
- **Playback in examples:** `play()` shells out to a system audio tool: Python uses **ffmpeg/ffplay** (or `mpv`), JS uses **ffplay**. It is for local/desktop use; in a server, `save()` to a file or stream the bytes instead. See [references/installation.md](references/installation.md).

## Quick start: Python

```python
from fishaudio import FishAudio
from fishaudio.utils import play, save

client = FishAudio()  # reads FISH_API_KEY

# Generate speech (returns the full audio as bytes)
audio = client.tts.convert(text="Hello from Fish Audio!")

save(audio, "output.mp3")   # write to a file
# play(audio)               # or play locally (needs ffmpeg)
```

Async: identical resource tree on `AsyncFishAudio`, used as a context manager:

```python
import asyncio
from fishaudio import AsyncFishAudio
from fishaudio.utils import save

async def main():
    async with AsyncFishAudio() as client:
        audio = await client.tts.convert(text="Hello from Fish Audio!")
        save(audio, "output.mp3")

asyncio.run(main())
```

## Quick start: JavaScript / TypeScript

```ts
import { FishAudioClient, play } from "fish-audio";

const client = new FishAudioClient({ apiKey: process.env.FISH_API_KEY });

// convert() returns audio you can play or pipe to a file
const audio = await client.textToSpeech.convert({
  text: "Hello from Fish Audio!",
}); // npm 0.1.0 defaults to the deprecated "s1"; pass a model as shown below
await play(audio); // local playback (needs ffplay)
```

To pick a model in JS, pass `backend` as the **positional** argument (not a named option):

```ts
import type { Backends } from "fish-audio";

// The cast is needed because the npm 0.1.0 `Backends` type omits "s2.1-pro".
const audio = await client.textToSpeech.convert(
  { text: "Hi" },
  "s2.1-pro" as Backends
);
```

## Capabilities → references

| Task                                                             | Reference                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------ |
| Install, auth, playback deps, verify a key                       | [references/installation.md](references/installation.md)     |
| Text-to-Speech (convert, stream, formats, prosody, model select) | [references/text-to-speech.md](references/text-to-speech.md) |
| Voice cloning (instant references + persistent voice models)     | [references/voice-cloning.md](references/voice-cloning.md)   |
| Speech-to-Text (models, timestamps, fields the SDK drops)        | [references/speech-to-text.md](references/speech-to-text.md) |
| Realtime WebSocket TTS (stream text → audio)                     | [references/websocket.md](references/websocket.md)           |
| Errors, retries, and timeouts (the **real** exception types)     | [references/errors.md](references/errors.md)                 |

## Python ↔ JavaScript name map

The two SDKs do **not** use the same names. Use this map when porting code between them.

| Concept               | Python (`fishaudio`)                              | JavaScript (`fish-audio`)                                  |
| --------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| Client                | `FishAudio()` / `AsyncFishAudio()`                | `new FishAudioClient({ apiKey })`                          |
| Text-to-Speech        | `client.tts.convert(text=...)` → `bytes`          | `client.textToSpeech.convert({ text })`                    |
| TTS HTTP stream       | `client.tts.stream(...)` → `AudioStream`          | (use `convert`; realtime streaming is `convertRealtime`)   |
| Realtime WebSocket    | `client.tts.stream_websocket(text_stream)`        | `client.textToSpeech.convertRealtime(request, textStream)` |
| Speech-to-Text        | `client.asr.transcribe(audio=...)`                | `client.speechToText.convert({ audio })`                   |
| List voice models     | `client.voices.list()`                            | `client.voices.search()`                                   |
| Get voice model       | `client.voices.get(id)`                           | `client.voices.get(id)`                                    |
| Create voice (clone)  | `client.voices.create(title=..., voices=[bytes])` | `client.voices.ivc.create({ title, voices: [File] })`      |
| Update / delete voice | `client.voices.update(id, ...)` / `delete(id)`    | `client.voices.update(id, ...)` / `delete(id)`             |
| Credit balance        | `client.account.get_credits()`                    | `client.user.get_api_credit()`                             |
| Subscription package  | `client.account.get_package()`                    | `client.user.get_package()`                                |
| Choose model          | `model="s2-pro"` keyword arg                      | positional `backend` arg, e.g. `convert(req, "s2-pro")`    |
| ASR model (header)    | `RequestOptions(additional_headers=...)`          | `convert(req, { headers: { model: "transcribe-1-pro" } })` |

## Decision shortcuts

- **Audio from text** → `tts.convert` (Python) / `textToSpeech.convert` (JS).
- **Reuse a saved voice** → pass `reference_id` (the voice model `id`).
- **Clone a voice instantly from a clip** → pass `references=[ReferenceAudio(audio=..., text=...)]` (Python) / `references: [{ audio, text }]` (JS). See [voice-cloning](references/voice-cloning.md).
- **Persistent custom voice to reuse** → create a voice model, then use its `id` as `reference_id`.
- **Stream tokens from an LLM and play speech as it arrives** → `tts.stream_websocket` (Python) / `textToSpeech.convertRealtime` (JS). See [websocket](references/websocket.md).
- **Transcribe audio** → `asr.transcribe` (Python) / `speechToText.convert` (JS) with the `model: transcribe-1-pro` header (recommended; without it, the request runs on `transcribe-1`). Pro request fields, `speaker_turns`, `request_id`, and the language fields need raw HTTP in Python (`fish-audio-sdk` 1.3.0). See [speech-to-text](references/speech-to-text.md).

## Gotchas (verified against the SDK source)

- Python `latency` accepts only **`"normal"` or `"balanced"`** (default `"balanced"`); there is no `"low"`.
- The Python client has **no `max_retries`** and does **not** auto-retry; the JS client **does** auto-retry (configurable via per-call `requestOptions.maxRetries`). See [errors](references/errors.md).
- Python defines a `ValidationError` class but **never raises it**, so don't catch it expecting validation failures; a 422 surfaces as `APIError`. The JS SDK throws `UnprocessableEntityError` on 422.
- ASR segment `start` / `end` and `duration` are all in **seconds**. The Python SDK's `ASRResponse` docstring says milliseconds; that is wrong. See [speech-to-text](references/speech-to-text.md).

<!-- /vendor-file -->

<!-- vendor-file: skills/fish-audio-sdk/references/errors.md -->
# Errors, Retries & Timeouts

The two SDKs have **different** exception models. The tables below reflect what the SDK source actually raises; not every exported class is thrown.

## Python exceptions

Hierarchy (all subclasses of `FishAudioError`):

| Exception             | When                                           | Attributes                        |
| --------------------- | ---------------------------------------------- | --------------------------------- |
| `APIError`            | base for HTTP errors                           | `.status`, `.message`, `.body`    |
| `AuthenticationError` | 401 (bad/missing key)                          | (APIError)                        |
| `PermissionError`     | 403                                            | (APIError)                        |
| `NotFoundError`       | 404 (voice id not found)                       | (APIError)                        |
| `RateLimitError`      | 429                                            | (APIError)                        |
| `ServerError`         | 5xx                                            | (APIError)                        |
| `WebSocketError`      | realtime stream failed                         | —                                 |
| `DependencyError`     | missing system tool (e.g. ffmpeg for `play()`) | `.dependency`, `.install_command` |

```python
from fishaudio import FishAudio
from fishaudio.exceptions import (
    AuthenticationError,
    RateLimitError,
    NotFoundError,
    APIError,
    FishAudioError,
)

client = FishAudio()
try:
    audio = client.tts.convert(text="Hello!", reference_id="maybe-missing")
except AuthenticationError:
    ...  # bad API key
except RateLimitError:
    ...  # slow down / out of quota
except NotFoundError:
    ...  # reference_id doesn't exist
except APIError as e:
    print(e.status, e.message)  # any other HTTP error
except FishAudioError as e:
    print("SDK error:", e)      # non-HTTP (e.g. WebSocketError, DependencyError)
```

> **Do not catch `ValidationError`.** The class exists and is exported, but the SDK **never raises it**. Invalid input comes back as an `APIError` (HTTP 422). Catch `APIError` (and read `.status == 422`) instead.

### Retries & timeouts (Python)

- **No automatic retries.** The Python client makes a single request and raises on failure. Implement your own retry loop if you need one (e.g. back off on `RateLimitError`).
- **Timeout** is set on the client: `FishAudio(timeout=240.0)` (seconds, default 240).
- `RequestOptions(max_retries=...)` exists but is currently a **no-op**, so don't rely on it. `RequestOptions(timeout=..., additional_headers=...)` does work per request:

```python
from fishaudio.core.request_options import RequestOptions

audio = client.tts.convert(
    text="Hello!",
    request_options=RequestOptions(timeout=30.0, additional_headers={"X-Trace": "abc"}),
)
```

## JavaScript exceptions

```ts
import {
  FishAudioClient,
  FishAudioError,
  FishAudioTimeoutError,
} from "fish-audio";
import { UnprocessableEntityError } from "fish-audio"; // re-exported from the package root

const client = new FishAudioClient();
try {
  const audio = await client.textToSpeech.convert({
    text: "Hello!",
    reference_id: "maybe-missing",
  });
} catch (err) {
  if (err instanceof UnprocessableEntityError) {
    console.error("422 validation:", err.body?.detail); // [{ loc, msg, type }]
  } else if (err instanceof FishAudioTimeoutError) {
    console.error("request timed out");
  } else if (err instanceof FishAudioError) {
    console.error(err.statusCode, err.body); // branch on err.statusCode (401/403/404/...)
  } else {
    throw err;
  }
}
```

What the JS client actually throws:

| Error                                                 | When                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `UnprocessableEntityError` (extends `FishAudioError`) | 422, the **only** typed HTTP subclass thrown; `.body` is `{ detail: [{ loc, msg, type }] }` |
| `FishAudioError`                                      | every other non-2xx response; read `.statusCode`, `.body`, `.rawResponse`                    |
| `FishAudioTimeoutError`                               | request exceeded the timeout                                                                 |

> The package also exports `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, and `TooEarlyError`, but the current client throws a generic `FishAudioError` for those statuses. **Branch on `err.statusCode`** rather than relying on `instanceof NotFoundError`.

### Retries & timeouts (JavaScript)

- **Automatic retries are built in.** The client retries `408`, `429`, and `>= 500` with exponential backoff (≈1 s base, 60 s cap) plus jitter, honoring `Retry-After`. You don't need to hand-roll a 429 loop.
- Tune per call via `requestOptions` (the trailing argument on every method):

```ts
const audio = await client.textToSpeech.convert({ text: "Hello!" }, "s2-pro", {
  maxRetries: 5,
  timeoutInSeconds: 30,
  abortSignal: controller.signal,
});
```

- Default request timeout is **240 s** (`240000 ms`); override with `requestOptions.timeoutInSeconds`.
- `requestOptions` also accepts per-request `apiKey`, `headers`, and `queryParams`.

## Inspecting raw responses (JS)

Every method returns an awaitable that also exposes the raw response:

```ts
const { data, rawResponse } = await client.textToSpeech
  .convert({ text: "Hi" })
  .withRawResponse();
console.log(rawResponse.headers);
```

<!-- /vendor-file -->

<!-- vendor-file: skills/fish-audio-sdk/references/installation.md -->
# Installation & Authentication

## Python (`fishaudio`)

```bash
pip install fish-audio-sdk          # imported as `fishaudio`
pip install "fish-audio-sdk[utils]" # adds local audio playback helpers (play)
```

- Requires Python 3.9+.
- Import name is **`fishaudio`** even though the PyPI/dist name is `fish-audio-sdk`.

## JavaScript / TypeScript (`fish-audio`)

```bash
npm install fish-audio
# or: pnpm add fish-audio  / yarn add fish-audio
```

- Requires Node.js 18+ (uses the global `fetch` / Web Streams).

## Authentication

Get an API key at `https://fish.audio/app/api-keys`. Both SDKs read `FISH_API_KEY` from the environment automatically.

```bash
export FISH_API_KEY=your_api_key_here
```

```python
from fishaudio import FishAudio

client = FishAudio()                       # reads FISH_API_KEY
client = FishAudio(api_key="your_api_key") # or pass explicitly
```

```ts
import { FishAudioClient } from "fish-audio";

const client = new FishAudioClient(); // reads FISH_API_KEY
const client2 = new FishAudioClient({ apiKey: process.env.MY_KEY }); // or pass explicitly
```

Never hardcode a key in source. If neither the argument nor `FISH_API_KEY` is set, the Python client raises `ValueError` at construction time.

### Other client options

| Option             | Python                              | JavaScript                                 |
| ------------------ | ----------------------------------- | ------------------------------------------ |
| API key            | `api_key=`                          | `apiKey:`                                  |
| Base URL           | `base_url="https://api.fish.audio"` | `baseUrl:` / `environment:`                |
| Request timeout    | `timeout=240.0` (seconds)           | per-call `requestOptions.timeoutInSeconds` |
| Custom HTTP client | `httpx_client=`                     | (not exposed)                              |

> Python caveat: if you pass your own `httpx_client`, the SDK uses it **as-is**. Your `base_url`, `timeout`, and the `Authorization` header are **not** applied to it. Pre-configure those on the client you inject.

There is no client-level `max_retries` or `default_headers` option in Python. Per-request headers go through `request_options`. See [errors.md](errors.md) for retry/timeout behavior.

## Local audio playback

The `play()` helper is for local/desktop use and shells out to a system tool:

- **Python:** needs `ffmpeg` (or pass `use_ffmpeg=False` to try `mpv`). Install the `[utils]` extra. Missing tools raise `DependencyError` with the install command.
- **JavaScript:** spawns `ffplay` (from ffmpeg) and is **Node-only**.

Install ffmpeg:

```bash
# macOS
brew install ffmpeg
# Debian/Ubuntu
sudo apt-get install ffmpeg
```

In a server or browser context, don't use `play()`. Use `save()` (Python) or write/stream the bytes yourself.

## Verify a key works

```python
from fishaudio import FishAudio

client = FishAudio()
print(client.account.get_credits())  # raises AuthenticationError (401) if the key is bad
```

```ts
import { FishAudioClient } from "fish-audio";

const client = new FishAudioClient();
console.log(await client.user.get_api_credit());
```

<!-- /vendor-file -->

<!-- vendor-file: skills/fish-audio-sdk/references/speech-to-text.md -->
# Speech-to-Text (ASR)

Both SDKs wrap `POST /v1/asr`: one audio file per request, and the response arrives when the whole file has been transcribed. Use `transcribe-1-pro`, the recommended model. Neither SDK has a `model` argument for ASR, so select it with the `model` HTTP header on every request. Full guide: `https://docs.fish.audio/features/speech-to-text`.

## Choose a model

- `transcribe-1-pro` (recommended): recordings up to 60 minutes, including multi-speaker conversations. `text` contains inline `<|speaker:N|>` markers and bracketed emotion or vocal-event cues such as `[laughter]` or `[高兴]`, and the API returns structured `speaker_turns` when you request timestamps.
- `transcribe-1`: general transcription of short recordings. It serves every request whose `model` header is missing or not an exact match.

Select `transcribe-1-pro` with the `model` header:

- Python: `request_options=RequestOptions(additional_headers={"model": "transcribe-1-pro"})`, with `from fishaudio.core import RequestOptions`.
- JavaScript: pass `{ headers: { model: "transcribe-1-pro" } }` as the second argument of `convert`.
- Write the value exactly, in lowercase. A missing or unrecognized value (for example `Transcribe-1-Pro` or `transcribe-1pro`) is served and billed as `transcribe-1`, and no error is returned. If you expected `transcribe-1-pro` but the transcript has no speaker markers and you did not send `diarize=false`, check the header.

## Python: `client.asr.transcribe`

```python
from fishaudio import FishAudio
from fishaudio.core import RequestOptions

client = FishAudio()  # reads FISH_API_KEY

with open("audio.wav", "rb") as f:
    result = client.asr.transcribe(
        audio=f.read(),
        language="en",  # optional hint; omit to auto-detect
        request_options=RequestOptions(
            additional_headers={"model": "transcribe-1-pro"},  # without this header: transcribe-1
            timeout=900,  # long Pro recordings can take several minutes
        ),
    )

print(result.text)

for seg in result.segments:
    print(f"[{seg.start:.2f}s - {seg.end:.2f}s] {seg.text}")
```

Keyword params:

| Param                | Type                     | Default      | Notes                                                                                                                                                                                             |
| -------------------- | ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audio`              | `bytes`                  | — (required) | Raw file bytes; the format is detected from the content. The SDK sends them as MessagePack.                                                                                                       |
| `language`           | `str`                    | auto-detect  | Optional hint, a lowercase ISO 639-1 code (`"en"`, `"zh"`, `"ja"`). Detection still runs, and the hint does not force the transcript language. `"en-US"` or `"English"` may be rejected with 400. |
| `include_timestamps` | `bool`                   | `True`       | `True` (default) requests word-level timestamps, which adds processing time; pass `False` when you only need text (`segments` is then empty).                                                     |
| `request_options`    | `RequestOptions \| None` | `None`       | Per-request `timeout` and headers. Select the model here: `RequestOptions(additional_headers={"model": "transcribe-1-pro"})`.                                                                     |

### Response shape (`ASRResponse`)

```python
result.text            # str: full transcript (Pro: with <|speaker:N|> markers and [cues])
result.duration        # float: total audio duration in seconds, including silence
result.segments        # list[ASRSegment]; [] when timestamps are off or no speech was found
# each segment:
seg.text               # str: usually one word (one or a few characters in Chinese/Japanese)
seg.start              # float: seconds
seg.end                # float: seconds (can equal start)
```

`duration`, `start`, and `end` are all in **seconds**. The SDK's `ASRResponse` docstring says milliseconds; that is wrong, so do not divide by 1000.

Segment text has no punctuation, speaker markers, or cues, and can be normalized (for example `35` for `3.5`), so it does not always match `text` character for character. Segments are not speaker turns.

### Fields the Python SDK does not expose

In `fish-audio-sdk` 1.3.0, `ASRResponse` keeps only `text`, `duration`, and `segments`. It silently drops these response fields:

- `speaker_turns` (`transcribe-1-pro`, when timestamps are requested);
- `request_id` (`transcribe-1-pro`), also sent as the `x-request-id` header;
- `language` (English name, such as `English`) and `language_code` (ISO 639-1, such as `en`), returned when the language is known.

`asr.transcribe()` also cannot send the `transcribe-1-pro` fields `tag_audio_events`, `diarize`, `num_speakers`, `min_speakers`, or `max_speakers`. For any of these, call the API directly. Field semantics are in the `fish-audio-api` skill (`POST /v1/asr`).

```python
import os
import httpx

with open("meeting.mp3", "rb") as f:
    r = httpx.post(
        "https://api.fish.audio/v1/asr",
        headers={
            "Authorization": f"Bearer {os.environ['FISH_API_KEY']}",
            "model": "transcribe-1-pro",
        },
        files={"audio": f},
        data={"ignore_timestamps": "false"},  # word timestamps + speaker_turns
        # Long Pro recordings can take several minutes; httpx defaults to 5 s.
        timeout=httpx.Timeout(900.0, connect=10.0),
    )
r.raise_for_status()
result = r.json()
print(result.get("language_code"), result.get("request_id"))
for turn in result.get("speaker_turns", []):
    print(f"{turn['speaker']} [{turn['start']:.2f}-{turn['end']:.2f}] {turn['text']}")
```

### Errors (Python)

`asr.transcribe()` raises `APIError` (`RateLimitError` for 429, `ServerError` for 5xx) with `.status`, `.message`, and `.body` (the raw response text). On `transcribe-1-pro`, error bodies also carry `code` and `request_id`:

```python
import json
from fishaudio.core import RequestOptions
from fishaudio.exceptions import APIError

try:
    result = client.asr.transcribe(
        audio=audio_bytes,
        request_options=RequestOptions(
            additional_headers={"model": "transcribe-1-pro"}
        ),
    )
except APIError as e:
    try:
        err = json.loads(e.body or "{}")
    except ValueError:
        err = {}  # errors from the network edge may not be JSON
    print(e.status, err.get("code"), err.get("request_id"))
    raise
```

Branch on `code` or the HTTP status, never on `message`. Retry 429 and 5xx with exponential backoff (the Python SDK does not retry); do not retry other 4xx responses. See the `fish-audio-api` skill for the status and `code` list. If you use `transcribe-1`, rely only on `status` and `message`.

## JavaScript: `client.speechToText.convert`

```ts
import { FishAudioClient } from "fish-audio";
import { readFile } from "node:fs/promises";

const client = new FishAudioClient();

const buf = await readFile("audio.wav");
const result = await client.speechToText.convert(
  {
    audio: new File([buf], "audio.wav"),
    language: "en", // optional hint; omit to auto-detect
    ignore_timestamps: false, // false → word-level segments (and speaker_turns on Pro)
  },
  { headers: { model: "transcribe-1-pro" }, timeoutInSeconds: 900 }
);

console.log(result.text);
for (const seg of result.segments) {
  console.log(`[${seg.start}-${seg.end}] ${seg.text}`);
}
```

`STTRequest` = `{ audio: File; language?: string; ignore_timestamps?: boolean }`, sent as multipart. JS uses `ignore_timestamps` (the inverse of Python's `include_timestamps`), and the server default is `true`, so you get no `segments` unless you pass `false`.

In Node.js, the built-in `fetch` that the SDK uses stops waiting for response headers after 300 s, whatever `timeoutInSeconds` says (the call fails with `fetch failed`). For long Pro recordings, raise that limit once at startup with the `undici` package (`undici@7` runs on Node.js 20.18.1+; `undici@8` needs Node.js 22.19+ and fails at import on older versions):

```ts
import { Agent, setGlobalDispatcher } from "undici"; // npm install undici@7

setGlobalDispatcher(
  new Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 })
);
```

`STTResponse` types only `{ text, duration, segments }`; at runtime the body also has `language`, `language_code`, and on Pro `request_id` and `speaker_turns`. Widen the type to read them:

```ts
type SpeakerTurn = {
  speaker: string;
  text: string;
  start: number;
  end: number;
};
const body = result as typeof result & {
  language?: string;
  language_code?: string;
  request_id?: string;
  speaker_turns?: SpeakerTurn[];
};
for (const turn of body.speaker_turns ?? []) {
  console.log(`${turn.speaker} [${turn.start}-${turn.end}] ${turn.text}`);
}
```

The JS SDK cannot send `tag_audio_events`, `diarize`, or the speaker counts; use `fetch` with `FormData` for those (see the `fish-audio-api` skill).

## Limits and formats (both SDKs)

- `transcribe-1-pro` accepts recordings up to 60 minutes (longer returns 400 `audio_too_long`). Send long recordings as compressed audio (MP3, Opus, or AAC); a request that is too large returns 413. Send a whole conversation as one file: speaker labels are consistent within one response, not across requests.
- Processing time grows with the length of the recording, and long `transcribe-1-pro` requests can take several minutes. Raise the SDK timeout for long recordings (the examples use 900 s; the defaults are in [errors](errors.md)), and in Node.js also raise the `fetch` header limit shown above.
- `transcribe-1-pro` accepts WAV, MP3, AAC (including M4A/MP4), FLAC, Ogg (Opus or Vorbis), WebM/Matroska, and MOV, including browser recordings, and uses the first audio track of a video file. AIFF, CAF, WMA, AMR, AC-3, and raw (headerless) PCM return 400.
- If you use `transcribe-1`: it is designed for short recordings, up to 50 MiB per request; keep MP3 and Opus files under 25 MiB. For recordings longer than a few minutes, use `transcribe-1-pro`. It accepts WAV, MP3, AAC (including M4A/MP4), FLAC, and Ogg (Opus or Vorbis); convert browser WebM recordings to Ogg/Opus, MP3, or WAV first, or use `transcribe-1-pro`.

<!-- /vendor-file -->

<!-- vendor-file: skills/fish-audio-sdk/references/text-to-speech.md -->
# Text-to-Speech

## Python: `client.tts`

`convert()` returns the **complete audio as `bytes`**. `stream()` returns an iterable of byte chunks.

```python
from fishaudio import FishAudio
from fishaudio.utils import play, save

client = FishAudio()

# Simplest: default model voice
audio = client.tts.convert(text="Hello, world!")
save(audio, "out.mp3")

# Use a specific voice model by id
audio = client.tts.convert(
    text="Using a saved voice.",
    reference_id="9a9cf47702da476aa4629e2506d4a857",
)

# Pick a model and adjust speed
audio = client.tts.convert(text="Speaking faster.", model="s2-pro", speed=1.5)
```

### `tts.convert` parameters

All keyword-only:

| Param             | Type                                | Default       | Notes                                                            |
| ----------------- | ----------------------------------- | ------------- | ---------------------------------------------------------------- |
| `text`            | `str`                               | — (required)  | Text to synthesize.                                              |
| `reference_id`    | `str \| None`                       | `None`        | Voice model id to speak with.                                    |
| `references`      | `list[ReferenceAudio] \| None`      | `None`        | Inline clone samples; see [voice-cloning.md](voice-cloning.md). |
| `format`          | `"mp3" \| "wav" \| "pcm" \| "opus"` | `"mp3"`       | Output format.                                                   |
| `latency`         | `"normal" \| "balanced"`            | `"balanced"`  | `normal` = higher quality, `balanced` = faster. (No `"low"`.)    |
| `speed`           | `float`                             | —             | Shortcut for prosody speed (0.5–2.0).                            |
| `config`          | `TTSConfig`                         | `TTSConfig()` | Reusable bundle of the settings below.                           |
| `model`           | `"s2-pro" \| "s1"`                  | `"s2-pro"`    | Synthesis model per current SDK typing. The API also accepts `"s2.1-pro"` / `"s2.1-pro-free"`, forwarded fine at runtime, but add `# type: ignore` for static checkers. `s1` is deprecated and will be retired on December 31, 2026; after that date, requests that specify `s1` are served by `s2.1-pro`. `speech-1.5` / `speech-1.6` are deprecated. |
| `request_options` | `RequestOptions \| None`            | `None`        | Per-request timeout / headers; see [errors.md](errors.md).      |

Direct params (`reference_id`, `format`, `latency`, `speed`) override the matching field on `config` when set.

### Reusable config with `TTSConfig`

```python
from fishaudio.types import TTSConfig, Prosody

config = TTSConfig(
    reference_id="933563129e564b19a115bedd57b7406a",
    format="wav",
    latency="normal",
    prosody=Prosody(speed=1.2, volume=-5),  # speed 0.5–2.0, volume dB -20..20
    temperature=0.7,                         # 0.0–1.0
    top_p=0.7,                               # 0.0–1.0
    chunk_length=200,                        # 100–300
)

audio1 = client.tts.convert(text="First line.", config=config)
audio2 = client.tts.convert(text="Second line.", config=config)
```

`TTSConfig` fields (with defaults): `format="mp3"`, `sample_rate=None`, `mp3_bitrate=128` (`64|128|192`), `opus_bitrate=32` (kbps: `-1000|24|32|48|64`, `-1000`=auto), `normalize=True`, `chunk_length=200`, `latency="balanced"`, `reference_id=None`, `references=[]`, `prosody=None`, `top_p=0.7`, `temperature=0.7`, `max_new_tokens=1024`, `repetition_penalty=1.2`, `min_chunk_length=50`, `condition_on_previous_chunks=True`, `early_stop_threshold=1.0`.

### Streaming the HTTP response

```python
# Iterate chunks as they arrive
for chunk in client.tts.stream(text="Long passage..."):
    sink.write(chunk)

# Or collect everything into bytes
audio = client.tts.stream(text="Hello!").collect()
```

Async: every method mirrors onto `AsyncFishAudio`; `await client.tts.convert(...)`, and `client.tts.stream(...)` must be awaited before iterating with `async for`.

## JavaScript: `client.textToSpeech`

`convert(request, backend?, requestOptions?)` resolves to a `ReadableStream<Uint8Array>` you can `play()` or pipe to a file. `backend` is the **second positional** argument, **not** a named option. Always pass it: the npm release (`fish-audio` 0.1.0) defaults it to the deprecated `"s1"` at runtime, although its README says `"s2-pro"`.

```ts
import { FishAudioClient, play, type Backends } from "fish-audio";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";

const client = new FishAudioClient();

// model only (the cast is needed: the npm 0.1.0 `Backends` type omits "s2.1-pro")
const audio = await client.textToSpeech.convert(
  { text: "Hello, world!" },
  "s2.1-pro" as Backends
);
await play(audio);

// specific voice + model
const audio2 = await client.textToSpeech.convert(
  {
    text: "Using a saved voice.",
    reference_id: "9a9cf47702da476aa4629e2506d4a857",
  },
  "s2.1-pro" as Backends // <-- positional backend, not { backend: "s2.1-pro" }
);

// pipe to a file instead of playing
await new Promise((resolve, reject) =>
  Readable.fromWeb(audio2)
    .pipe(createWriteStream("out.mp3"))
    .on("finish", resolve)
    .on("error", reject)
);
```

`TTSRequest` (the first argument) fields: `text` (required), `reference_id?`, `references?`, `format?`, `latency?`, `prosody?: { speed?; volume? }`, `temperature?`, `top_p?`, `chunk_length?`, `mp3_bitrate?`, `opus_bitrate?`, `sample_rate?`, `normalize?`, plus the advanced generation knobs (`max_new_tokens`, `repetition_penalty`, etc.). Field names are `snake_case`, matching the API.

> The npm 0.1.0 JS `Backends` type is `'speech-1.5' | 'speech-1.6' | 'agent-x0' | 's1' | 's1-mini'`; the API also accepts `s2-pro`, `s2.1-pro`, and `s2.1-pro-free`, so pass those with an `as Backends` cast. Prefer `s2.1-pro` for production. Do not choose `s1` or `s1-mini`.

## Model & expression notes

- `s2.1-pro` is recommended for production; `s2-pro` is the Python SDK default. `s1` is the previous generation: S1 is deprecated and will be retired on December 31, 2026. After that date, requests that specify `s1` are served by `s2.1-pro`. Migration: `https://docs.fish.audio/developer-guide/models-pricing/migrate-from-s1`.
- Emotion/expression is controlled inline in `text` (S2-Pro uses free-form `[bracket]` tags; the deprecated S1 uses legacy `(parenthesis)` tags, and the API does not convert between them); there is no separate SDK parameter. Full tag list: `https://docs.fish.audio/api-reference/emotion-reference`.

<!-- /vendor-file -->

<!-- vendor-file: skills/fish-audio-sdk/references/voice-cloning.md -->
# Voice Cloning & Voice Models

Two ways to use a custom voice:

1. **Instant (zero-shot)**: pass reference audio inline on each `convert` call. Nothing is saved.
2. **Persistent voice model**: create a model once, then reuse its `id` as `reference_id`.

## 1. Instant cloning (inline references)

### Python

```python
from fishaudio import FishAudio
from fishaudio.types import ReferenceAudio
from fishaudio.utils import save

client = FishAudio()

with open("reference.wav", "rb") as f:
    audio = client.tts.convert(
        text="This is spoken in the cloned voice.",
        references=[ReferenceAudio(audio=f.read(), text="Exact transcript of reference.wav.")],
    )
save(audio, "cloned.mp3")
```

`ReferenceAudio` = `{ audio: <bytes>, text: <str> }`. `text` must match what's spoken in `audio` (include punctuation for prosody). 10–30 s of clean speech works best.

### JavaScript

```ts
import { FishAudioClient, play } from "fish-audio";
import { readFile } from "node:fs/promises";

const client = new FishAudioClient();

const buf = await readFile("reference.wav");
const audio = await client.textToSpeech.convert({
  text: "This is spoken in the cloned voice.",
  references: [
    {
      audio: new File([buf], "reference.wav"),
      text: "Exact transcript of reference.wav.",
    },
  ],
});
await play(audio);
```

In JS, `ReferenceAudio.audio` is a `File`.

## 2. Persistent voice models

### Create: Python `voices.create`

```python
with open("sample1.wav", "rb") as f1, open("sample2.wav", "rb") as f2:
    voice = client.voices.create(
        title="My Voice",
        voices=[f1.read(), f2.read()],   # list of raw audio bytes, one per sample
        description="Custom clone",
        texts=["Transcript of sample1.", "Transcript of sample2."],  # optional; ASR is run if omitted
        tags=["en", "narration"],
        visibility="private",            # "public" | "unlist" | "private" (default "private")
    )

print(voice.id, voice.state)  # state: created | training | trained | failed
```

`voices.create` keyword params: `title` (required), `voices: list[bytes]` (required), `description`, `texts`, `tags`, `cover_image: bytes`, `visibility="private"`, `train_mode="fast"`, `enhance_audio_quality=True`.

### Create: JavaScript `voices.ivc.create`

```ts
import { readFile } from "node:fs/promises";

const buf = await readFile("sample1.wav");
const voice = await client.voices.ivc.create({
  title: "My Voice",
  voices: [new File([buf], "sample1.wav")], // File[]
  description: "Custom clone",
  visibility: "private",
});
console.log(voice._id, voice.state);
```

> Note the JS path is `client.voices.ivc.create` (IVC = instant voice cloning), and `voices` are `File[]`.

### Use a created model

```python
audio = client.tts.convert(text="Using my saved voice.", reference_id=voice.id)
```

```ts
const audio = await client.textToSpeech.convert({
  text: "Using my saved voice.",
  reference_id: voice._id,
});
```

## Managing voice models

| Action | Python                                                                                 | JavaScript                                                  |
| ------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| List   | `client.voices.list(self_only=True)` → `PaginatedResponse[Voice]` (`.total`, `.items`) | `client.voices.search({ self: true })` → `{ total, items }` |
| Get    | `client.voices.get(voice_id)`                                                          | `client.voices.get(voiceId)`                                |
| Update | `client.voices.update(voice_id, title=..., visibility=...)`                            | `client.voices.update(voiceId, { title, visibility })`      |
| Delete | `client.voices.delete(voice_id)`                                                       | `client.voices.delete(voiceId)`                             |

Python `voices.list` is manually paged: `page_size` (default 10), `page_number` (default 1), plus filters `title`, `tags`, `self_only`, `author_id`, `language`, `title_language`, and `sort_by` (`"task_count"` default, or `"created_at"`). There is no auto-pager; loop `page_number` yourself.

A model is usable as a `reference_id` once its `state` is `"trained"`. States: `created → training → trained` (or `failed`).

<!-- /vendor-file -->

<!-- vendor-file: skills/fish-audio-sdk/references/websocket.md -->
# Realtime WebSocket TTS

Stream text in and get audio out as it's generated, ideal for piping an LLM's token stream to speech.

## Python: `client.tts.stream_websocket`

The first argument is an **iterable of text chunks** (plain `str`, or `TextEvent` / `FlushEvent` for fine control). The sync method returns an `Iterator[bytes]`; the async method must be awaited and returns an `AsyncIterator[bytes]`.

### Sync

```python
from fishaudio import FishAudio
from fishaudio.utils import play

client = FishAudio()

def text_chunks():
    yield "Hello, "
    yield "this is "
    yield "streaming speech."

# Consume audio chunks as they arrive...
for chunk in client.tts.stream_websocket(text_chunks(), reference_id="<voice-id>", model="s2-pro"):
    sink.write(chunk)

# ...or just play the whole stream locally:
play(client.tts.stream_websocket(text_chunks()))
```

### Async

```python
import asyncio
from fishaudio import AsyncFishAudio

async def text_chunks():
    yield "Hello, "
    yield "streaming speech."

async def main():
    async with AsyncFishAudio() as client:
        audio_stream = await client.tts.stream_websocket(text_chunks())
        with open("out.mp3", "wb") as f:
            async for chunk in audio_stream:
                f.write(chunk)

asyncio.run(main())
```

`stream_websocket` keyword params mirror `convert`: `reference_id`, `references`, `format`, `latency`, `speed`, `config`, `model` (default `"s2-pro"`), plus `ws_options` (a `WebSocketOptions` for keepalive/message-size tuning). The sync version also accepts `max_workers` (default `10`) for its background sender thread; the async version does not.

For manual control, yield events instead of strings:

```python
from fishaudio.types import TextEvent, FlushEvent

def events():
    yield TextEvent(text="First sentence.")
    yield FlushEvent()                 # force synthesis of buffered text now
    yield TextEvent(text="Second sentence.")
```

The SDK sends the start/stop frames for you; you only supply text/flush.

## JavaScript: `client.textToSpeech.convertRealtime`

Returns a `RealtimeConnection`; subscribe to events with `RealtimeEvents`. Set `request.text` to `""` and stream the real text via the second argument.

```ts
import { FishAudioClient, RealtimeEvents } from "fish-audio";
import { writeFile } from "node:fs/promises";

const client = new FishAudioClient();

async function* textStream() {
  for (const chunk of [
    "Hello from Fish Audio! ",
    "Streaming over WebSocket.",
  ]) {
    yield chunk;
  }
}

const connection = await client.textToSpeech.convertRealtime(
  { text: "", reference_id: "<voice-id>" },
  textStream()
  // optional positional backend, e.g. "s2-pro"
);

const chunks: Buffer[] = [];
connection.on(RealtimeEvents.OPEN, () => console.log("open"));
connection.on(RealtimeEvents.AUDIO_CHUNK, audio => {
  if (audio instanceof Uint8Array || Buffer.isBuffer(audio))
    chunks.push(Buffer.from(audio));
});
connection.on(RealtimeEvents.ERROR, err => console.error(err));
connection.on(RealtimeEvents.CLOSE, async () => {
  await writeFile("out.mp3", Buffer.concat(chunks));
});
```

`RealtimeEvents`: `OPEN`, `AUDIO_CHUNK`, `ERROR`, `CLOSE`. `textStream` may be an `Iterable<string>` or `AsyncIterable<string>`.

## Protocol notes

- The close frame's event literal is **`"stop"`**, not `"close"` (handled for you by both SDKs; relevant only if you drop to raw frames; use the `fish-audio-api` skill for that).
- A realtime run that fails mid-stream surfaces as `WebSocketError` (Python) / an `ERROR` event (JS). Reconnect rather than retrying on the same socket.

<!-- /vendor-file -->

