//! Kevo's ears (Phase 1, `docs/kevo-briefs/phase-1.md`): hearing on this PC
//! with sherpa-onnx, statically linked behind the `kevo-ears` feature. Its build
//! script downloads the prebuilt static libraries for the pinned crate version
//! from github.com/k2-fsa/sherpa-onnx/releases (or takes them from
//! `SHERPA_ONNX_ARCHIVE_DIR` / `SHERPA_ONNX_LIB_DIR`).
//!
//! Step 1.2 pins the three models. They are never in the installer: `install`
//! fetches them on first use through the app's checked download
//! (`model_download`: pinned huggingface.co URL at a fixed commit, exact size,
//! SHA-256, resumable). Until the listening pipeline (step 1.3) calls it, this
//! module is compiled only for tests.
use crate::model_download::{self, policy::ModelSpec, store};
use sherpa_onnx::{
    KeywordSpotter, KeywordSpotterConfig, OnlineModelConfig, OnlineRecognizer, OnlineRecognizerConfig, OnlineTransducerModelConfig,
    SileroVadModelConfig, VadModelConfig, VoiceActivityDetector,
};
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

pub const RATE: i32 = 16_000;


/// Every downloaded file. Sizes and hashes were read from the Hub's LFS
/// pointers on 2026-11-18 and checked against the files themselves; the KWS
/// files are byte-identical to k2-fsa's official release
/// `kws-models/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2`.
static MODELS: [ModelSpec; 7] = [
    // Silero VAD v4.0 (MIT), byte-identical to github.com/snakers4/silero-vad v4.0 files/silero_vad.onnx.
    ModelSpec {
        id: "kevo-vad",
        file: "silero_vad_v4.onnx",
        url: "https://huggingface.co/csukuangfj/vad/resolve/fba88cd2e921609e7675c3aaf51e0b9b295da4bc/silero_vad.onnx",
        sha256: "a35ebf52fd3ce5f1469b2a36158dba761bc47b973ea3382b3186ca15b1f5af28",
        size: 1_807_522,
    },
    // Keyword spotter: sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01 (Apache-2.0).
    ModelSpec {
        id: "kevo-kws-encoder",
        file: "kws-encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
        url: "https://huggingface.co/mobilebytesensei/sherpa-onnx-kws-zipformer-gigaspeech-3.3M/resolve/e8ca74a794ce66e38a100e7c60c0214189ff4100/encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
        sha256: "1e721676515bcd42a186979733981213c66c80db680e1cc582dfedf3be76e678",
        size: 4_807_159,
    },
    ModelSpec {
        id: "kevo-kws-decoder",
        file: "kws-decoder-epoch-12-avg-2-chunk-16-left-64.onnx",
        url: "https://huggingface.co/mobilebytesensei/sherpa-onnx-kws-zipformer-gigaspeech-3.3M/resolve/e8ca74a794ce66e38a100e7c60c0214189ff4100/decoder-epoch-12-avg-2-chunk-16-left-64.onnx",
        sha256: "f61ebd3eed3773a44d088d53dfae92dbb6aec4839f4dcaee2d402414741663a3",
        size: 1_063_189,
    },
    ModelSpec {
        id: "kevo-kws-joiner",
        file: "kws-joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
        url: "https://huggingface.co/mobilebytesensei/sherpa-onnx-kws-zipformer-gigaspeech-3.3M/resolve/e8ca74a794ce66e38a100e7c60c0214189ff4100/joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
        sha256: "eae9da0c7e1e6c6a3f4cc42d167899c388f6c6701b94cb96320e4f55df79624c",
        size: 163_380,
    },
    // Transcription: sherpa-onnx-streaming-zipformer-en-2023-06-26 (Apache-2.0, trained on LibriSpeech).
    ModelSpec {
        id: "kevo-asr-encoder",
        file: "asr-encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26/resolve/672fbf1b30579d6585301139bb363f42a0ad4a24/encoder-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
        sha256: "563fde436d16cf7607cf408cd6b30909819d03162652ef389c2450ced3f45ac1",
        size: 71_083_163,
    },
    ModelSpec {
        id: "kevo-asr-decoder",
        file: "asr-decoder-epoch-99-avg-1-chunk-16-left-128.onnx",
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26/resolve/672fbf1b30579d6585301139bb363f42a0ad4a24/decoder-epoch-99-avg-1-chunk-16-left-128.onnx",
        sha256: "7bf787f90b194b307e5a4ad6a34fadb4e748304c35f78a8d66358a05b13ee6ef",
        size: 2_092_621,
    },
    ModelSpec {
        id: "kevo-asr-joiner",
        file: "asr-joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
        url: "https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26/resolve/672fbf1b30579d6585301139bb363f42a0ad4a24/joiner-epoch-99-avg-1-chunk-16-left-128.int8.onnx",
        sha256: "d944208d660d67c8d72cd2acaeac971fa5ceb8c80e76c1968148846fedd6e297",
        size: 259_335,
    },
];

/// The two models' `tokens.txt` (5 KB vocabularies, Apache-2.0, from the same
/// pinned commits). Compiled in: the checked download refuses `text/*`
/// responses, which is how the Hub serves these small non-LFS files.
const KWS_TOKENS: &[u8] = include_bytes!("../resources/kevo-ears/kws-tokens.txt");
const ASR_TOKENS: &[u8] = include_bytes!("../resources/kevo-ears/asr-tokens.txt");

/// "KEVO" and "HEY KEVO" in the KWS model's BPE pieces (its `bpe.model`, as
/// `sherpa-onnx-cli text2token` does). Boosting score and threshold are the
/// sherpa-onnx defaults until step 1.4 tunes them.
pub const KEYWORDS: &str = "▁K E VO @KEVO\n▁HE Y ▁K E VO @HEY_KEVO\n";

fn path(dir: &Path, id: &str) -> String {
    let spec = MODELS.iter().find(|m| m.id == id).expect("pinned model id");
    store::final_path(dir, spec).to_string_lossy().into_owned()
}

/// Download (resuming a partial file) and verify every model not yet
/// installed in `dir`. `emit(id, phase, done)` reports progress.
pub async fn install<F: FnMut(&'static str, &'static str, u64) + Send>(dir: &Path, cancel: &Arc<AtomicBool>, emit: &mut F) -> Result<(), String> {
    for spec in &MODELS {
        model_download::download(spec, dir, cancel, &mut |phase, done| emit(spec.id, phase, done)).await?;
    }
    Ok(())
}

/// True when every model is installed (verified) in `dir`.
pub fn installed(dir: &Path) -> bool {
    MODELS.iter().all(|m| store::installed(dir, m))
}

pub fn voice_activity_detector(dir: &Path) -> Option<VoiceActivityDetector> {
    let config = VadModelConfig {
        silero_vad: SileroVadModelConfig {
            model: Some(path(dir, "kevo-vad")),
            threshold: 0.5,
            min_silence_duration: 0.25,
            min_speech_duration: 0.25,
            window_size: 512,
            max_speech_duration: 20.0,
        },
        sample_rate: RATE,
        num_threads: 1,
        provider: Some("cpu".into()),
        ..Default::default()
    };
    VoiceActivityDetector::create(&config, 30.0)
}

fn transducer(dir: &Path, part: &str, tokens: &[u8]) -> OnlineModelConfig {
    OnlineModelConfig {
        transducer: OnlineTransducerModelConfig {
            encoder: Some(path(dir, &format!("kevo-{part}-encoder"))),
            decoder: Some(path(dir, &format!("kevo-{part}-decoder"))),
            joiner: Some(path(dir, &format!("kevo-{part}-joiner"))),
        },
        tokens_buf: Some(tokens.to_vec()),
        num_threads: 1,
        provider: Some("cpu".into()),
        ..Default::default()
    }
}

pub fn keyword_spotter(dir: &Path) -> Option<KeywordSpotter> {
    KeywordSpotter::create(&KeywordSpotterConfig { model_config: transducer(dir, "kws", KWS_TOKENS), keywords_buf: Some(KEYWORDS.into()), ..Default::default() })
}

pub fn recognizer(dir: &Path) -> Option<OnlineRecognizer> {
    OnlineRecognizer::create(&OnlineRecognizerConfig {
        model_config: transducer(dir, "asr", ASR_TOKENS),
        decoding_method: Some("greedy_search".into()),
        ..Default::default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model_download::policy::is_sha256_hex;
    use sherpa_onnx::Wave;
    use std::path::PathBuf;
    use std::sync::OnceLock;

    fn clip(name: &str) -> Vec<f32> {
        let file = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/kevo-selftest").join(format!("{name}.wav"));
        let wave = Wave::read(&file.to_string_lossy()).unwrap_or_else(|| panic!("read {}", file.display()));
        assert_eq!(wave.sample_rate(), RATE);
        wave.samples().to_vec()
    }

    /// One shared folder, installed once per test run (tests run in parallel).
    fn models() -> &'static Path {
        static DIR: OnceLock<PathBuf> = OnceLock::new();
        DIR.get_or_init(|| {
            let dir = std::env::temp_dir().join("anf-kevo-ears-models");
            let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
            runtime.block_on(install(&dir, &Arc::new(AtomicBool::new(false)), &mut |_, _, _| {})).expect("download and verify the pinned Kevo models");
            assert!(installed(&dir));
            dir
        })
    }

    /// (start, length) in samples of every speech segment the VAD finds.
    fn segments(vad: &VoiceActivityDetector, samples: &[f32]) -> Vec<(i64, i32)> {
        for window in samples.chunks(512) {
            vad.accept_waveform(window);
        }
        vad.flush();
        let mut found = Vec::new();
        while let Some(segment) = vad.front() {
            found.push((segment.start(), segment.n()));
            vad.pop();
        }
        found
    }

    #[test]
    fn every_model_is_pinned_to_a_hub_commit_with_size_and_hash() {
        for m in &MODELS {
            assert!(m.url.starts_with("https://huggingface.co/") && m.url.contains("/resolve/"), "{}", m.id);
            let commit = m.url.split("/resolve/").nth(1).and_then(|r| r.split('/').next()).unwrap_or_default();
            assert!(commit.len() == 40 && commit.bytes().all(|b| b.is_ascii_hexdigit()), "{} must name a commit, not a branch", m.id);
            assert!(is_sha256_hex(m.sha256) && m.size > 0, "{}", m.id);
            assert!(!m.file.contains(['/', '\\']), "{}", m.id);
        }
        let mut files: Vec<_> = MODELS.iter().map(|m| m.file).collect();
        files.sort_unstable();
        files.dedup();
        assert_eq!(files.len(), MODELS.len(), "file names must not collide in one folder");
        assert!(MODELS.iter().map(|m| m.size).sum::<u64>() < 100_000_000, "keep the first-use download small");
    }

    #[test]
    fn silero_vad_hears_the_request_in_a_selftest_clip_and_nothing_in_silence() {
        let dir = models();
        // "Kevo, what time is it?": 2.02 s, speech starts after 0.3 s of silence.
        let found = segments(&voice_activity_detector(dir).expect("create the VAD"), &clip("req-time-ljspeech"));
        assert!(!found.is_empty(), "no speech found");
        let start = found[0].0 as f32 / RATE as f32;
        let heard: i32 = found.iter().map(|s| s.1).sum();
        assert!((0.1..0.8).contains(&start), "speech should start near 0.3 s, VAD said {start:.2} s");
        assert!(heard as f32 / RATE as f32 > 0.8, "VAD heard only {heard} samples of a 1.7 s request: {found:?}");
        let silence = vec![0.0; 3 * RATE as usize];
        assert!(segments(&voice_activity_detector(dir).unwrap(), &silence).is_empty(), "silence must not count as speech");
    }

    #[test]
    fn keyword_spotter_and_recognizer_load_and_run_on_selftest_clips() {
        let dir = models();
        // Loading proves the files, tokens and keyword pieces fit together; wake
        // and false-wake rates are measured and tuned in step 1.4.
        let kws = keyword_spotter(dir).expect("create the keyword spotter with KEVO / HEY KEVO");
        let tail = vec![0.0; RATE as usize / 2];
        let mut woke = Vec::new();
        for n in 1..=20 {
            let stream = kws.create_stream();
            stream.accept_waveform(RATE, &clip(&format!("wake-{n:02}")));
            stream.accept_waveform(RATE, &tail);
            stream.input_finished();
            while kws.is_ready(&stream) {
                kws.decode(&stream);
                if let Some(hit) = kws.get_result(&stream).filter(|r| !r.keyword.is_empty()) {
                    woke.push(hit.keyword);
                    kws.reset(&stream);
                }
            }
        }
        eprintln!("untuned keyword spotter woke on {} of 20 wake clips: {woke:?}", woke.len());
        assert!(woke.iter().all(|k| k == "KEVO" || k == "HEY_KEVO"), "{woke:?}");

        let asr = recognizer(dir).expect("create the streaming recognizer");
        let stream = asr.create_stream();
        stream.accept_waveform(RATE, &clip("req-time-ljspeech"));
        stream.accept_waveform(RATE, &tail);
        stream.input_finished();
        while asr.is_ready(&stream) {
            asr.decode(&stream);
        }
        let text = asr.get_result(&stream).map(|r| r.text).unwrap_or_default();
        assert!(text.contains("WHAT TIME IS IT"), "heard {text:?} for \"Kevo, what time is it?\"");
    }
}
