//! Kevo's ears (Phase 1, `docs/kevo-briefs/phase-1.md`): hearing on this PC
//! with sherpa-onnx, statically linked behind the `kevo-ears` feature. Its build
//! script downloads the prebuilt static libraries for the pinned crate version
//! from github.com/k2-fsa/sherpa-onnx/releases (or takes them from
//! `SHERPA_ONNX_ARCHIVE_DIR` / `SHERPA_ONNX_LIB_DIR`). Step 1.1 only proves the
//! library builds, links and runs in CI; the listening pipeline is step 1.3.

#[cfg(test)]
mod tests {
    use crate::model_download::{self, policy::ModelSpec};
    use sherpa_onnx::{SileroVadModelConfig, VadModelConfig, VoiceActivityDetector, Wave};
    use std::path::Path;
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    /// Silero VAD v4.0 (MIT, Silero Team), byte-identical to
    /// github.com/snakers4/silero-vad/blob/v4.0/files/silero_vad.onnx, from the
    /// sherpa-onnx maintainer's Hub repo at a fixed commit. Fetched by the
    /// test through the app's checked download, never committed.
    static SILERO_VAD: ModelSpec = ModelSpec {
        id: "silero-vad-v4",
        file: "silero_vad.onnx",
        url: "https://huggingface.co/csukuangfj/vad/resolve/fba88cd2e921609e7675c3aaf51e0b9b295da4bc/silero_vad.onnx",
        sha256: "a35ebf52fd3ce5f1469b2a36158dba761bc47b973ea3382b3186ca15b1f5af28",
        size: 1_807_522,
    };
    const RATE: i32 = 16_000;

    fn vad(model: &Path) -> VoiceActivityDetector {
        let config = VadModelConfig {
            silero_vad: SileroVadModelConfig {
                model: Some(model.to_string_lossy().into_owned()),
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
        VoiceActivityDetector::create(&config, 30.0).expect("create the Silero VAD")
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
    fn silero_vad_hears_the_request_in_a_selftest_clip_and_nothing_in_silence() {
        let dir = std::env::temp_dir().join("anf-kevo-ears-models");
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        runtime
            .block_on(model_download::download(&SILERO_VAD, &dir, &Arc::new(AtomicBool::new(false)), &mut |_, _| {}))
            .expect("download and verify the pinned Silero VAD model");
        let model = model_download::store::final_path(&dir, &SILERO_VAD);

        // "Kevo, what time is it?": 2.02 s, speech starts after 0.3 s of silence.
        let clip = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/kevo-selftest/req-time-ljspeech.wav");
        let wave = Wave::read(&clip.to_string_lossy()).expect("read the self-test clip");
        assert_eq!(wave.sample_rate(), RATE);
        let found = segments(&vad(&model), wave.samples());
        assert!(!found.is_empty(), "no speech found in {}", clip.display());
        let start = found[0].0 as f32 / RATE as f32;
        let heard: i32 = found.iter().map(|s| s.1).sum();
        assert!((0.1..0.8).contains(&start), "speech should start near 0.3 s, VAD said {start:.2} s");
        assert!(heard as f32 / RATE as f32 > 0.8, "VAD heard only {heard} samples of a 1.7 s request: {found:?}");

        assert!(segments(&vad(&model), &vec![0.0; 3 * RATE as usize]).is_empty(), "silence must not count as speech");
    }
}
