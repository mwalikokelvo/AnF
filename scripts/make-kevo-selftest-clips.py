#!/usr/bin/env python3
"""Make Kevo's self-test clips (docs/kevo-briefs/phase-0.md, step 0.4a).

Synthetic voices only (Piper, free and offline once the voices are downloaded).
Writes 16 kHz mono 16-bit WAV files and clips.json to
windows/src-tauri/resources/kevo-selftest/.

    pip install piper-tts==1.8.0      # also needs ffmpeg on PATH
    python3 scripts/make-kevo-selftest-clips.py [--cache DIR]
    python3 scripts/make-kevo-selftest-clips.py --check   # check only, no Piper needed

The voices (about 220 MB) are downloaded once into the cache folder and checked
against the SHA-256 below. Piper adds a little random variation, so remade
clips sound alike but are not byte-identical.
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "windows" / "src-tauri" / "resources" / "kevo-selftest"
VOICE_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
MAX_TOTAL_BYTES = 20 * 1024 * 1024

MODELS = {
    "en_US-ljspeech-medium": {
        "path": "en/en_US/ljspeech/medium/en_US-ljspeech-medium",
        "sha256": "6f52a751e2349abe7a76735eb09dc1875298c77ea2342ffd2fef79ff81b87f22",
        "dataset": "LJ Speech (https://keithito.com/LJ-Speech-Dataset/)",
        "license": "public domain",
    },
    "en_US-libritts_r-medium": {
        "path": "en/en_US/libritts_r/medium/en_US-libritts_r-medium",
        "sha256": "10bb85e071d616fcf4071f369f1799d0491492ab3c5d552ec19fb548fac13195",
        "dataset": "LibriTTS-R (http://www.openslr.org/141/)",
        "license": "CC BY 4.0",
    },
    "en_GB-vctk-medium": {
        "path": "en/en_GB/vctk/medium/en_GB-vctk-medium",
        "sha256": "4e9fc85ab9009385319fc6bae7f55577f8a2d7ee77fd9159a5500eb6531f41e6",
        "dataset": "VCTK (https://datashare.ed.ac.uk/handle/10283/3443)",
        "license": "CC BY 4.0",
    },
}

# Voice id -> (model, speaker name in the model's speaker_id_map, or None).
VOICES = {
    "ljspeech": ("en_US-ljspeech-medium", None),
    "libritts-3922": ("en_US-libritts_r-medium", "3922"),
    "libritts-8699": ("en_US-libritts_r-medium", "8699"),
    "vctk-p239": ("en_GB-vctk-medium", "p239"),
    "vctk-p236": ("en_GB-vctk-medium", "p236"),
    "vctk-p264": ("en_GB-vctk-medium", "p264"),
}

# Step 0.5 table. Clips play in this order; the later ones of a check come
# inside the follow-up window, without the name.
CHECKS = [
    ("several_in_a_row", [
        ("time", "Kevo, what time is it?", "tell_time"),
        ("help", "What can you do?", "help"),
        ("timer", "Set a timer for ten seconds", "timer_set"),
    ]),
    ("open_app", [("open-brave", "Kevo, open Brave browser", "open_app")]),
    ("stop", [("black-holes", "Kevo, tell me about black holes", "ai_conversation")]),
]
REQUEST_VOICES = ["ljspeech", "libritts-3922"]

# The name may be said "KEE-vo" or "KEH-vo": "Kevvo" makes Piper say the second.
WAKE_TEXTS = ["Kevo.", "Hey Kevo.", "Kevvo.", "Hey Kevvo."]
# A name called on its own is said a little slower than Piper's default pace.
WAKE_PACE = 1.15
WAKE_VOICES = ["ljspeech", "libritts-3922", "libritts-8699", "vctk-p239", "vctk-p236"]

LOOKALIKES = ["Cave.", "Kevin.", "Carbo.", "Heavy.", "Kevlar.",
              "Gravy.", "Chevy.", "Hey Kevin.", "Navy.", "Clever."]


def fetch_model(name, cache):
    info = MODELS[name]
    onnx = cache / f"{name}.onnx"
    conf = cache / f"{name}.onnx.json"
    for target, suffix in ((onnx, ".onnx"), (conf, ".onnx.json")):
        if not target.exists():
            print(f"downloading {name}{suffix}")
            urllib.request.urlretrieve(VOICE_BASE + info["path"] + suffix, target)
    digest = hashlib.sha256(onnx.read_bytes()).hexdigest()
    if digest != info["sha256"]:
        sys.exit(f"{onnx}: SHA-256 {digest} does not match {info['sha256']}; delete it and retry")
    return onnx


def synthesize(voices, voice_id, text, out_path, length_scale=None):
    from piper import SynthesisConfig

    voice, speaker = voices[voice_id]
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / "raw.wav"
        with wave.open(str(raw), "wb") as w:
            voice.synthesize_wav(text, w, syn_config=SynthesisConfig(speaker_id=speaker, length_scale=length_scale))
        # 16 kHz mono 16-bit, with 0.3 s of silence before and after.
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw),
             "-af", "adelay=300,apad=pad_dur=0.3", "-ar", "16000", "-ac", "1",
             "-sample_fmt", "s16", "-map_metadata", "-1", "-bitexact", str(out_path)],
            check=True,
        )
    with wave.open(str(out_path), "rb") as w:
        assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (16000, 1, 2)
        return round(w.getnframes() / 16000, 2)


def check_clips():
    """Check the committed clips against the brief without remaking them."""
    manifest = json.loads((OUT / "clips.json").read_text(encoding="utf-8"))
    problems = []
    for clip in manifest["clips"]:
        path = OUT / clip["file"]
        if not path.exists():
            problems.append(f"{clip['id']}: {clip['file']} is missing")
            continue
        with wave.open(str(path), "rb") as w:
            if (w.getframerate(), w.getnchannels(), w.getsampwidth()) != (16000, 1, 2):
                problems.append(f"{clip['id']}: not 16 kHz mono 16-bit")
    by_kind = lambda kind: [c for c in manifest["clips"] if c["kind"] == kind]
    requests = by_kind("request")
    for _, steps in CHECKS:
        for _, words, _ in steps:
            if len({c["voice"] for c in requests if c["words"] == words.rstrip(".")}) < 2:
                problems.append(f"request {words!r} is not in two voices")
    wake = by_kind("wake")
    if len(wake) < 20 or len({c["voice"] for c in wake}) < 4:
        problems.append("need 20 wake clips in at least 4 voices")
    if len(by_kind("lookalike")) < 10:
        problems.append("need 10 look-alike clips")
    files = {c["file"] for c in manifest["clips"]} | {"clips.json", "README.md"}
    stray = sorted(p.name for p in OUT.iterdir() if p.name not in files)
    if stray:
        problems.append(f"files not in clips.json: {stray}")
    total = sum(p.stat().st_size for p in OUT.iterdir() if p.is_file())
    if total > MAX_TOTAL_BYTES:
        problems.append(f"{total} bytes is over 20 MB")
    for problem in problems:
        print(problem)
    print(f"{len(manifest['clips'])} clips, {total / 1024 / 1024:.2f} MB: "
          + ("FAIL" if problems else "ok"))
    return 1 if problems else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--cache", default=os.path.join(Path.home(), ".cache", "anf-kevo-piper"))
    parser.add_argument("--check", action="store_true", help="check the committed clips, make nothing")
    args = parser.parse_args()
    if args.check:
        sys.exit(check_clips())
    try:
        from piper import PiperVoice
    except ImportError:
        sys.exit("Piper is missing: pip install piper-tts==1.8.0")

    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    loaded = {name: PiperVoice.load(str(fetch_model(name, cache))) for name in MODELS}
    voices = {}
    for vid, (model, speaker) in VOICES.items():
        voice = loaded[model]
        sid = None if speaker is None else voice.config.speaker_id_map[speaker]
        voices[vid] = (voice, sid)

    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.wav"):
        old.unlink()

    clips, checks = [], []

    def add(clip_id, kind, voice_id, text, expect, check=None, length_scale=None):
        file = f"{clip_id}.wav"
        seconds = synthesize(voices, voice_id, text, OUT / file, length_scale)
        clip = {"id": clip_id, "file": file, "kind": kind, "voice": voice_id,
                "words": text.rstrip("."), "seconds": seconds, "expect": expect}
        if check:
            clip["check"] = check
        clips.append(clip)
        return clip_id

    for voice_id in REQUEST_VOICES:
        for check, steps in CHECKS:
            ids = [add(f"req-{step}-{voice_id}", "request", voice_id, text,
                       {"action": action}, check)
                   for step, text, action in steps]
            checks.append({"check": check, "voice": voice_id, "clips": ids})

    for i in range(20):
        text = WAKE_TEXTS[i % len(WAKE_TEXTS)]
        voice_id = WAKE_VOICES[i % len(WAKE_VOICES)]
        add(f"wake-{i + 1:02d}", "wake", voice_id, text, {"wake": True}, length_scale=WAKE_PACE)
        if "Kevvo" in text:
            clips[-1]["words"] = text.replace("Kevvo", "Kevo").rstrip(".")
            clips[-1]["note"] = "said KEH-vo"

    for i, text in enumerate(LOOKALIKES):
        add(f"lookalike-{i + 1:02d}", "lookalike", WAKE_VOICES[i % len(WAKE_VOICES)],
            text, {"wake": False}, length_scale=WAKE_PACE)

    manifest = {
        "version": 1,
        "about": "Kevo self-test clips, Phase 0 step 0.4a. Remake with scripts/make-kevo-selftest-clips.py.",
        "format": {"sample_rate": 16000, "channels": 1, "bits": 16},
        "voices": {vid: {"model": model, "speaker": speaker,
                         "dataset": MODELS[model]["dataset"],
                         "license": MODELS[model]["license"]}
                   for vid, (model, speaker) in VOICES.items()},
        "checks": checks,
        "clips": clips,
    }
    (OUT / "clips.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    if check_clips():
        sys.exit(1)


if __name__ == "__main__":
    main()
