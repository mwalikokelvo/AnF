//! Kevo's ears (Phase 1, `docs/kevo-briefs/phase-1.md`): hearing on this PC
//! with sherpa-onnx, statically linked behind the `kevo-ears` feature. Its build
//! script downloads the prebuilt static libraries for the pinned crate version
//! from github.com/k2-fsa/sherpa-onnx/releases (or takes them from
//! `SHERPA_ONNX_ARCHIVE_DIR` / `SHERPA_ONNX_LIB_DIR`).
//!
//! Step 1.2 pins the three models. Step 1.3 wires the live listening pipeline:
//! cpal 16 kHz mono microphone capture -> Silero VAD -> Keyword Spotter ->
//! streaming ASR, emitting kevo-ears-* events to the webview.

#[cfg(feature = "kevo-ears")]
pub use ears_impl::*;

#[cfg(not(feature = "kevo-ears"))]
pub use stubs::*;

#[cfg(feature = "kevo-ears")]
mod ears_impl {
    use crate::model_download::{self, policy::ModelSpec, store};
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use sherpa_onnx::{
        KeywordSpotter, KeywordSpotterConfig, OnlineModelConfig, OnlineRecognizer, OnlineRecognizerConfig,
        OnlineTransducerModelConfig, SileroVadModelConfig, VadModelConfig, VoiceActivityDetector,
    };
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex, OnceLock};

    pub const RATE: i32 = 16_000;

    /// Every downloaded file. Sizes and hashes were read from the Hub's LFS
    /// pointers on 2026-11-18 and checked against the files themselves; the KWS
    /// files are byte-identical to k2-fsa's official release
    /// `kws-models/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2`.
    pub static MODELS: [ModelSpec; 7] = [
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

    const KWS_TOKENS: &[u8] = include_bytes!("../resources/kevo-ears/kws-tokens.txt");
    const ASR_TOKENS: &[u8] = include_bytes!("../resources/kevo-ears/asr-tokens.txt");

    pub const KEYWORDS: &str = "▁K E VO @KEVO\n▁HE Y ▁K E VO @HEY_KEVO\n";

    pub fn models_dir() -> PathBuf {
        crate::platform::local_dir().join("kevo-ears").join("models")
    }

    fn path(dir: &Path, id: &str) -> String {
        let spec = MODELS.iter().find(|m| m.id == id).expect("pinned model id");
        store::final_path(dir, spec).to_string_lossy().into_owned()
    }

    /// Download and verify every model not yet installed in `dir`.
    pub async fn install<F: FnMut(&'static str, &'static str, u64) + Send>(
        dir: &Path,
        cancel: &Arc<AtomicBool>,
        emit: &mut F,
    ) -> Result<(), String> {
        for spec in &MODELS {
            model_download::download(spec, dir, cancel, &mut |phase, done| emit(spec.id, phase, done)).await?;
        }
        Ok(())
    }

    /// True when every model is installed in `dir`.
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
        KeywordSpotter::create(&KeywordSpotterConfig {
            model_config: transducer(dir, "kws", KWS_TOKENS),
            keywords_buf: Some(KEYWORDS.into()),
            ..Default::default()
        })
    }

    pub fn recognizer(dir: &Path) -> Option<OnlineRecognizer> {
        OnlineRecognizer::create(&OnlineRecognizerConfig {
            model_config: transducer(dir, "asr", ASR_TOKENS),
            decoding_method: Some("greedy_search".into()),
            ..Default::default()
        })
    }

    /// Linear sample rate converter for streaming audio frames.
    pub struct LinearResampler {
        in_rate: f64,
        out_rate: f64,
        pos: f64,
        /// Last sample of the previous frame; `None` before the first frame.
        last_sample: Option<f32>,
    }

    impl LinearResampler {
        pub fn new(in_rate: u32, out_rate: u32) -> Self {
            Self {
                in_rate: in_rate as f64,
                out_rate: out_rate as f64,
                pos: 0.0,
                last_sample: None,
            }
        }

        pub fn process(&mut self, input: &[f32], output: &mut Vec<f32>) {
            if (self.in_rate - self.out_rate).abs() < 1e-3 {
                output.extend_from_slice(input);
                if let Some(&s) = input.last() {
                    self.last_sample = Some(s);
                }
                return;
            }

            let ratio = self.in_rate / self.out_rate;
            let mut in_idx = 0;
            let n = input.len();

            while in_idx < n {
                if self.pos < in_idx as f64 + 1.0 {
                    let frac = (self.pos - in_idx as f64) as f32;
                    let curr = input[in_idx];
                    let prev = if in_idx == 0 { self.last_sample.unwrap_or(curr) } else { input[in_idx - 1] };
                    let val = prev + (curr - prev) * frac.clamp(0.0, 1.0);
                    output.push(val);
                    self.pos += ratio;
                } else {
                    in_idx += 1;
                }
            }
            self.pos -= n as f64;
            if let Some(&s) = input.last() {
                self.last_sample = Some(s);
            }
        }
    }

    /// The microphone stream (`cpal::Stream`) is not `Send` on Windows, so it
    /// lives on the pipeline thread and is dropped when that thread ends.
    struct EarsHandle {
        stop_flag: Arc<AtomicBool>,
        muted: Arc<AtomicBool>,
    }

    static EARS: OnceLock<Mutex<Option<EarsHandle>>> = OnceLock::new();

    #[tauri::command]
    pub fn kevo_ears_models_installed() -> bool {
        installed(&models_dir())
    }

    #[tauri::command]
    pub async fn kevo_ears_install_models(app: tauri::AppHandle) -> Result<(), String> {
        use tauri::Emitter;
        let dir = models_dir();
        let cancel = Arc::new(AtomicBool::new(false));
        install(&dir, &cancel, &mut |id, phase, done| {
            let _ = app.emit("kevo-ears-download-progress", serde_json::json!({ "id": id, "phase": phase, "done": done }));
        }).await
    }

    #[tauri::command]
    pub fn kevo_ears_status() -> Result<serde_json::Value, String> {
        let state = EARS.get_or_init(|| Mutex::new(None)).lock().map_err(|e| e.to_string())?;
        if let Some(handle) = state.as_ref() {
            Ok(serde_json::json!({
                "running": true,
                "muted": handle.muted.load(Ordering::Relaxed),
            }))
        } else {
            Ok(serde_json::json!({
                "running": false,
                "muted": false,
            }))
        }
    }

    #[tauri::command]
    pub fn kevo_ears_stop() -> Result<(), String> {
        let mut state = EARS.get_or_init(|| Mutex::new(None)).lock().map_err(|e| e.to_string())?;
        if let Some(handle) = state.take() {
            handle.stop_flag.store(true, Ordering::Relaxed);
        }
        Ok(())
    }

    #[tauri::command]
    pub fn kevo_ears_mute(muted: bool) -> Result<(), String> {
        let state = EARS.get_or_init(|| Mutex::new(None)).lock().map_err(|e| e.to_string())?;
        if let Some(handle) = state.as_ref() {
            handle.muted.store(muted, Ordering::Relaxed);
        }
        Ok(())
    }

    #[tauri::command]
    pub fn kevo_ears_start(app: tauri::AppHandle) -> Result<(), String> {
        let dir = models_dir();
        if !installed(&dir) {
            return Err("Kevo hearing models are not installed yet".into());
        }

        let mut state = EARS.get_or_init(|| Mutex::new(None)).lock().map_err(|e| e.to_string())?;
        if state.is_some() {
            return Ok(());
        }

        let vad = voice_activity_detector(&dir).ok_or_else(|| "Failed to create VAD".to_string())?;
        let kws = keyword_spotter(&dir).ok_or_else(|| "Failed to create keyword spotter".to_string())?;
        let asr = recognizer(&dir).ok_or_else(|| "Failed to create recognizer".to_string())?;

        let stop_flag = Arc::new(AtomicBool::new(false));
        let muted = Arc::new(AtomicBool::new(false));
        let worker_stop = Arc::clone(&stop_flag);
        let worker_muted = Arc::clone(&muted);
        let own_stop = Arc::clone(&stop_flag);
        let (ready_tx, ready_rx) = std::sync::mpsc::sync_channel::<Result<(), String>>(1);

        std::thread::Builder::new()
            .name("kevo-ears-pipeline".into())
            .spawn(move || {
                let (stream, rx) = match open_microphone(&app) {
                    Ok(opened) => opened,
                    Err(e) => {
                        let _ = ready_tx.send(Err(e));
                        return;
                    }
                };
                let _ = ready_tx.send(Ok(()));
                run_ears_pipeline(rx, worker_stop, worker_muted, app.clone(), vad, kws, asr);
                drop(stream);
                // Ended without kevo_ears_stop (the microphone went away): forget this
                // handle so the status is honest and kevo_ears_start works again.
                if let Ok(mut state) = EARS.get_or_init(|| Mutex::new(None)).lock() {
                    if state.as_ref().is_some_and(|h| Arc::ptr_eq(&h.stop_flag, &own_stop)) {
                        *state = None;
                        use tauri::Emitter;
                        let _ = app.emit("kevo-ears-error", "Kevo stopped listening: the microphone stream ended");
                    }
                }
            })
            .map_err(|e| format!("Failed to spawn pipeline thread: {e}"))?;

        ready_rx.recv().map_err(|_| "Kevo hearing stopped while starting".to_string())??;
        *state = Some(EarsHandle { stop_flag, muted });
        Ok(())
    }

    /// Opens the default microphone as 16 kHz mono and starts it playing.
    fn open_microphone(app: &tauri::AppHandle) -> Result<(cpal::Stream, std::sync::mpsc::Receiver<Vec<f32>>), String> {
        let host = cpal::default_host();
        let device = host.default_input_device().ok_or_else(|| "No default microphone input device found".to_string())?;
        let config = device.default_input_config().map_err(|e| format!("Failed to read microphone config: {e}"))?;

        let channels = config.channels() as usize;
        let sample_rate = config.sample_rate().0;
        let sample_format = config.sample_format();

        let (tx, rx) = std::sync::mpsc::sync_channel::<Vec<f32>>(200);

        let err_app = app.clone();
        let err_fn = move |err: cpal::StreamError| {
            use tauri::Emitter;
            let _ = err_app.emit("kevo-ears-error", err.to_string());
        };

        let stream = match sample_format {
            cpal::SampleFormat::F32 => {
                let mut resampler = LinearResampler::new(sample_rate, RATE as u32);
                let tx = tx.clone();
                device.build_input_stream(
                    &config.into(),
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        let mut mono = Vec::with_capacity(data.len() / channels);
                        for frame in data.chunks(channels) {
                            mono.push(frame.iter().sum::<f32>() / channels as f32);
                        }
                        let mut resampled = Vec::with_capacity(mono.len());
                        resampler.process(&mono, &mut resampled);
                        if !resampled.is_empty() {
                            let _ = tx.try_send(resampled);
                        }
                    },
                    err_fn,
                    None,
                )
            }
            cpal::SampleFormat::I16 => {
                let mut resampler = LinearResampler::new(sample_rate, RATE as u32);
                let tx = tx.clone();
                device.build_input_stream(
                    &config.into(),
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        let mut mono = Vec::with_capacity(data.len() / channels);
                        for frame in data.chunks(channels) {
                            mono.push(frame.iter().map(|&s| s as f32 / 32768.0).sum::<f32>() / channels as f32);
                        }
                        let mut resampled = Vec::with_capacity(mono.len());
                        resampler.process(&mono, &mut resampled);
                        if !resampled.is_empty() {
                            let _ = tx.try_send(resampled);
                        }
                    },
                    err_fn,
                    None,
                )
            }
            cpal::SampleFormat::U16 => {
                let mut resampler = LinearResampler::new(sample_rate, RATE as u32);
                let tx = tx.clone();
                device.build_input_stream(
                    &config.into(),
                    move |data: &[u16], _: &cpal::InputCallbackInfo| {
                        let mut mono = Vec::with_capacity(data.len() / channels);
                        for frame in data.chunks(channels) {
                            mono.push(frame.iter().map(|&s| (s as f32 - 32768.0) / 32768.0).sum::<f32>() / channels as f32);
                        }
                        let mut resampled = Vec::with_capacity(mono.len());
                        resampler.process(&mono, &mut resampled);
                        if !resampled.is_empty() {
                            let _ = tx.try_send(resampled);
                        }
                    },
                    err_fn,
                    None,
                )
            }
            _ => return Err(format!("Unsupported audio sample format: {sample_format:?}")),
        }.map_err(|e| format!("Failed to build input stream: {e}"))?;

        stream.play().map_err(|e| format!("Failed to start audio stream: {e}"))?;
        Ok((stream, rx))
    }

    fn run_ears_pipeline(
        rx: std::sync::mpsc::Receiver<Vec<f32>>,
        stop: Arc<AtomicBool>,
        muted: Arc<AtomicBool>,
        app: tauri::AppHandle,
        vad: VoiceActivityDetector,
        kws: KeywordSpotter,
        asr: OnlineRecognizer,
    ) {
        use tauri::Emitter;

        let kws_stream = kws.create_stream();
        let mut asr_stream = asr.create_stream();
        let mut buffer = Vec::with_capacity(1024);
        let mut had_speech = false;
        let mut last_partial = String::new();

        while !stop.load(Ordering::Relaxed) {
            match rx.recv_timeout(std::time::Duration::from_millis(50)) {
                Ok(samples) => {
                    if muted.load(Ordering::Relaxed) {
                        buffer.clear();
                        if had_speech {
                            asr_stream = asr.create_stream();
                            had_speech = false;
                            last_partial.clear();
                        }
                        continue;
                    }
                    buffer.extend_from_slice(&samples);
                    while buffer.len() >= 512 {
                        let chunk: Vec<f32> = buffer.drain(..512).collect();
                        vad.accept_waveform(&chunk);
                        let is_speech = vad.detected();
                        // Only the live flag is used; drop finished segments so the queue stays empty.
                        while !vad.is_empty() {
                            vad.pop();
                        }

                        // Keyword spotter runs continuously on audio frames
                        kws_stream.accept_waveform(RATE, &chunk);
                        while kws.is_ready(&kws_stream) {
                            kws.decode(&kws_stream);
                            if let Some(hit) = kws.get_result(&kws_stream).filter(|r| !r.keyword.is_empty()) {
                                let kw = hit.keyword.clone();
                                kws.reset(&kws_stream);
                                let _ = app.emit("kevo-ears-wake", &kw);
                            }
                        }

                        // Transcription runs only while VAD hears speech
                        if is_speech {
                            had_speech = true;
                            asr_stream.accept_waveform(RATE, &chunk);
                            while asr.is_ready(&asr_stream) {
                                asr.decode(&asr_stream);
                            }
                            if let Some(res) = asr.get_result(&asr_stream) {
                                let text = res.text.trim();
                                if !text.is_empty() && text != last_partial {
                                    last_partial = text.to_string();
                                    let _ = app.emit("kevo-ears-partial", &last_partial);
                                }
                            }
                        } else if had_speech {
                            asr_stream.input_finished();
                            while asr.is_ready(&asr_stream) {
                                asr.decode(&asr_stream);
                            }
                            let final_text = asr.get_result(&asr_stream).map(|r| r.text.trim().to_string()).unwrap_or_default();
                            if !final_text.is_empty() {
                                let _ = app.emit("kevo-ears-final", &final_text);
                            }
                            asr_stream = asr.create_stream();
                            last_partial.clear();
                            had_speech = false;
                        }
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    }
}

#[cfg(not(feature = "kevo-ears"))]
mod stubs {
    #[tauri::command]
    pub fn kevo_ears_models_installed() -> bool {
        false
    }

    #[tauri::command]
    pub async fn kevo_ears_install_models(_app: tauri::AppHandle) -> Result<(), String> {
        Err("kevo-ears feature not enabled".into())
    }

    #[tauri::command]
    pub fn kevo_ears_status() -> Result<serde_json::Value, String> {
        Ok(serde_json::json!({
            "running": false,
            "muted": false,
        }))
    }

    #[tauri::command]
    pub fn kevo_ears_stop() -> Result<(), String> {
        Ok(())
    }

    #[tauri::command]
    pub fn kevo_ears_mute(_muted: bool) -> Result<(), String> {
        Ok(())
    }

    #[tauri::command]
    pub fn kevo_ears_start(_app: tauri::AppHandle) -> Result<(), String> {
        Err("kevo-ears feature not enabled".into())
    }
}

#[cfg(test)]
mod tests {
    #[cfg(feature = "kevo-ears")]
    use super::ears_impl::*;
    #[cfg(feature = "kevo-ears")]
    use crate::model_download::policy::is_sha256_hex;
    #[cfg(feature = "kevo-ears")]
    use sherpa_onnx::{VoiceActivityDetector, Wave};
    #[cfg(feature = "kevo-ears")]
    use std::path::{Path, PathBuf};
    #[cfg(feature = "kevo-ears")]
    use std::sync::atomic::AtomicBool;
    #[cfg(feature = "kevo-ears")]
    use std::sync::{Arc, OnceLock};

    #[test]
    fn linear_resampler_resamples_from_48k_to_16k_accurately() {
        #[cfg(feature = "kevo-ears")]
        {
            let mut resampler = LinearResampler::new(48_000, 16_000);
            let input = vec![0.5f32; 4800];
            let mut output = Vec::new();
            resampler.process(&input, &mut output);
            assert_eq!(output.len(), 1600);
            for s in output {
                assert!((s - 0.5).abs() < 1e-4);
            }
        }
    }

    #[cfg(feature = "kevo-ears")]
    fn clip(name: &str) -> Vec<f32> {
        let file = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/kevo-selftest").join(format!("{name}.wav"));
        let wave = Wave::read(&file.to_string_lossy()).unwrap_or_else(|| panic!("read {}", file.display()));
        assert_eq!(wave.sample_rate(), RATE);
        wave.samples().to_vec()
    }

    #[cfg(feature = "kevo-ears")]
    fn test_models() -> &'static Path {
        static DIR: OnceLock<PathBuf> = OnceLock::new();
        DIR.get_or_init(|| {
            let dir = std::env::temp_dir().join("anf-kevo-ears-models");
            let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
            runtime.block_on(install(&dir, &Arc::new(AtomicBool::new(false)), &mut |_, _, _| {})).expect("download and verify the pinned Kevo models");
            assert!(installed(&dir));
            dir
        })
    }

    #[cfg(feature = "kevo-ears")]
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
    #[cfg(feature = "kevo-ears")]
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
    #[cfg(feature = "kevo-ears")]
    fn silero_vad_hears_the_request_in_a_selftest_clip_and_nothing_in_silence() {
        let dir = test_models();
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
    #[cfg(feature = "kevo-ears")]
    fn keyword_spotter_and_recognizer_load_and_run_on_selftest_clips() {
        let dir = test_models();
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
