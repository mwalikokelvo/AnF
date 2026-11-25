//! Bounded, local-only FFmpeg jobs. User paths and encoder arguments never enter a shell.
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::{path::{Path,PathBuf},sync::{Arc,Mutex,atomic::{AtomicBool,Ordering}},process::{Command,Stdio},time::{Duration,Instant}};
use tauri::State;
#[cfg(not(target_os="linux"))]
use tauri::Manager;
#[derive(Default)]pub struct AudioJobs(Mutex<Option<(String,Arc<AtomicBool>)>>);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioEditRegion {
    pub kind: String,
    pub start_sec: f64,
    pub end_sec: f64,
    pub gain: f64,
}

#[derive(Debug, Default)]
pub struct AudioEditHistory {
    undo_stack: Vec<AudioEditRegion>,
    redo_stack: Vec<AudioEditRegion>,
}

impl AudioEditHistory {
    pub fn apply(&mut self, region: AudioEditRegion) -> Result<usize, String> {
        if !matches!(region.kind.as_str(), "trim" | "gain" | "mute" | "normalize") {
            return Err("Unknown audio edit kind.".into());
        }
        if !region.start_sec.is_finite()
            || !region.end_sec.is_finite()
            || region.start_sec < 0.0
            || region.end_sec < region.start_sec
        {
            return Err("Invalid edit region bounds.".into());
        }
        if self.undo_stack.len() >= 100 {
            self.undo_stack.remove(0);
        }
        self.undo_stack.push(region);
        self.redo_stack.clear();
        Ok(self.undo_stack.len())
    }

    pub fn undo(&mut self) -> Option<AudioEditRegion> {
        let item = self.undo_stack.pop()?;
        self.redo_stack.push(item.clone());
        Some(item)
    }

    pub fn redo(&mut self) -> Option<AudioEditRegion> {
        let item = self.redo_stack.pop()?;
        self.undo_stack.push(item.clone());
        Some(item)
    }

    pub fn active_regions(&self) -> Vec<AudioEditRegion> {
        self.undo_stack.clone()
    }
}

#[derive(Default)]
pub struct AudioEditState(Mutex<AudioEditHistory>);

#[derive(Debug, Default)]
pub struct AudioQueueInner {
    pub current: Option<String>,
    pub up_next: VecDeque<String>,
    pub history: Vec<String>,
    pub speeds: HashMap<String, f64>,
}

impl AudioQueueInner {
    pub fn push_up_next(&mut self, id: String) {
        if !id.trim().is_empty() && self.up_next.len() < 500 {
            self.up_next.push_back(id);
        }
    }

    pub fn advance_next(&mut self) -> Option<String> {
        let next = self.up_next.pop_front()?;
        if let Some(prev) = self.current.replace(next.clone()) {
            if self.history.len() >= 200 {
                self.history.remove(0);
            }
            self.history.push(prev);
        }
        Some(next)
    }

    pub fn go_previous(&mut self) -> Option<String> {
        let prev = self.history.pop()?;
        if let Some(curr) = self.current.replace(prev.clone()) {
            self.up_next.push_front(curr);
        }
        Some(prev)
    }

    pub fn set_speed(&mut self, id: String, speed: f64) -> f64 {
        let clamped = if speed.is_finite() { speed.clamp(0.5, 3.0) } else { 1.0 };
        if !id.trim().is_empty() {
            self.speeds.insert(id, clamped);
        }
        clamped
    }

    pub fn get_speed(&self, id: &str) -> f64 {
        self.speeds.get(id).copied().unwrap_or(1.0)
    }
}

#[derive(Default)]
pub struct AudioQueueState(Mutex<AudioQueueInner>);

#[tauri::command]
pub fn audio_queue_push(state: State<'_, AudioQueueState>, id: String) -> Result<usize, String> {
    let mut guard = state.0.lock().map_err(|_| "Audio queue lock unavailable.")?;
    guard.push_up_next(id);
    Ok(guard.up_next.len())
}

#[tauri::command]
pub fn audio_queue_next(state: State<'_, AudioQueueState>) -> Result<Option<String>, String> {
    let mut guard = state.0.lock().map_err(|_| "Audio queue lock unavailable.")?;
    Ok(guard.advance_next())
}

#[tauri::command]
pub fn audio_queue_prev(state: State<'_, AudioQueueState>) -> Result<Option<String>, String> {
    let mut guard = state.0.lock().map_err(|_| "Audio queue lock unavailable.")?;
    Ok(guard.go_previous())
}

#[tauri::command]
pub fn audio_set_item_speed(
    state: State<'_, AudioQueueState>,
    id: String,
    speed: f64,
) -> Result<f64, String> {
    let mut guard = state.0.lock().map_err(|_| "Audio queue lock unavailable.")?;
    Ok(guard.set_speed(id, speed))
}

#[tauri::command]
pub fn audio_get_item_speed(state: State<'_, AudioQueueState>, id: String) -> Result<f64, String> {
    let guard = state.0.lock().map_err(|_| "Audio queue lock unavailable.")?;
    Ok(guard.get_speed(&id))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaSessionState {
    pub title: String,
    pub artist: String,
    pub duration_sec: f64,
    pub position_sec: f64,
    pub playback_rate: f64,
    pub playing: bool,
}

impl Default for MediaSessionState {
    fn default() -> Self {
        Self {
            title: String::new(),
            artist: String::new(),
            duration_sec: 0.0,
            position_sec: 0.0,
            playback_rate: 1.0,
            playing: false,
        }
    }
}

impl MediaSessionState {
    pub fn apply_key(&mut self, key: &str) -> Result<(), String> {
        match key {
            "play" => self.playing = true,
            "pause" => self.playing = false,
            "toggle" => self.playing = !self.playing,
            "seek_forward" => {
                let max_pos = if self.duration_sec > 0.0 { self.duration_sec } else { f64::MAX };
                self.position_sec = (self.position_sec + 15.0).min(max_pos);
            }
            "seek_backward" => {
                self.position_sec = (self.position_sec - 15.0).max(0.0);
            }
            "next" | "previous" => {
                self.position_sec = 0.0;
            }
            _ => return Err("Unknown media key.".into()),
        }
        Ok(())
    }
}

#[derive(Default)]
pub struct AudioMediaSession(Mutex<MediaSessionState>);

#[tauri::command]
pub fn audio_media_session_update(
    state: State<'_, AudioMediaSession>,
    session: MediaSessionState,
) -> Result<MediaSessionState, String> {
    let mut guard = state.0.lock().map_err(|_| "Media session lock unavailable.")?;
    *guard = MediaSessionState {
        title: session.title.chars().take(200).collect(),
        artist: session.artist.chars().take(200).collect(),
        duration_sec: session.duration_sec.max(0.0),
        position_sec: session.position_sec.max(0.0),
        playback_rate: if session.playback_rate.is_finite() { session.playback_rate.clamp(0.5, 3.0) } else { 1.0 },
        playing: session.playing,
    };
    Ok(guard.clone())
}

#[tauri::command]
pub fn audio_media_session_state(state: State<'_, AudioMediaSession>) -> Result<MediaSessionState, String> {
    let guard = state.0.lock().map_err(|_| "Media session lock unavailable.")?;
    Ok(guard.clone())
}

#[tauri::command]
pub fn audio_media_key_dispatch(
    state: State<'_, AudioMediaSession>,
    key: String,
) -> Result<MediaSessionState, String> {
    let mut guard = state.0.lock().map_err(|_| "Media session lock unavailable.")?;
    guard.apply_key(&key)?;
    Ok(guard.clone())
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioPresetInfo {
    pub format: &'static str,
    pub preset: &'static str,
    pub description: &'static str,
}

#[tauri::command]
pub fn audio_list_presets() -> Vec<AudioPresetInfo> {
    vec![
        AudioPresetInfo { format: "mp3", preset: "quality", description: "MP3 320 kbps stereo" },
        AudioPresetInfo { format: "mp3", preset: "voice", description: "MP3 128 kbps mono 16 kHz" },
        AudioPresetInfo { format: "m4a", preset: "quality", description: "AAC 256 kbps faststart" },
        AudioPresetInfo { format: "opus", preset: "voice", description: "Opus 64 kbps speech" },
        AudioPresetInfo { format: "opus", preset: "compact", description: "Opus 32 kbps compact" },
        AudioPresetInfo { format: "flac", preset: "quality", description: "FLAC lossless" },
        AudioPresetInfo { format: "wav", preset: "quality", description: "WAV PCM 16-bit" },
    ]
}

#[tauri::command]
pub fn audio_validate_batch_job(
    count: usize,
    total_bytes: u64,
    format: String,
    preset: String,
) -> Result<(), String> {
    if count == 0 || count > 50 {
        return Err("Batch size must be between 1 and 50 tracks.".into());
    }
    if total_bytes > 256 * 1024 * 1024 {
        return Err("Batch total exceeds 256 MB limit.".into());
    }
    encoder(&format, &preset).map(|_| ())
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GaplessTransitionPlan {
    pub should_preload: bool,
    pub ms_until_preload: u64,
    pub ms_until_transition: u64,
    pub crossfade_sec: f64,
}

pub fn plan_gapless_transition(
    duration_sec: f64,
    position_sec: f64,
    preload_lead_sec: f64,
    crossfade_sec: f64,
) -> Result<GaplessTransitionPlan, String> {
    if !duration_sec.is_finite() || duration_sec <= 0.0 || !position_sec.is_finite() || position_sec < 0.0 {
        return Err("Invalid track duration or position.".into());
    }
    let remaining = (duration_sec - position_sec).max(0.0);
    let fade = crossfade_sec.clamp(0.0, 12.0).min(duration_sec * 0.4);
    let lead = preload_lead_sec.clamp(0.5, 30.0).max(fade);
    let until_preload = (remaining - lead).max(0.0);
    let until_transition = (remaining - fade).max(0.0);
    Ok(GaplessTransitionPlan {
        should_preload: remaining <= lead,
        ms_until_preload: (until_preload * 1000.0).round() as u64,
        ms_until_transition: (until_transition * 1000.0).round() as u64,
        crossfade_sec: fade,
    })
}

#[tauri::command]
pub fn audio_plan_gapless(
    duration_sec: f64,
    position_sec: f64,
    preload_lead_sec: Option<f64>,
    crossfade_sec: Option<f64>,
) -> Result<GaplessTransitionPlan, String> {
    plan_gapless_transition(
        duration_sec,
        position_sec,
        preload_lead_sec.unwrap_or(4.0),
        crossfade_sec.unwrap_or(1.5),
    )
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClipAuditReport {
    pub clipped_samples: usize,
    pub max_clip_run: usize,
    pub peak_db: f64,
    pub crest_factor_db: f64,
    pub has_clipping: bool,
}

pub fn audit_clipping(samples: &[f32], clip_threshold: f32) -> Result<ClipAuditReport, String> {
    if samples.is_empty() {
        return Err("Provide non-empty audio samples for clip audit.".into());
    }
    let thresh = clip_threshold.clamp(0.5, 1.0);
    let mut clipped_samples = 0usize;
    let mut current_run = 0usize;
    let mut max_clip_run = 0usize;
    let mut peak = 0.0_f64;
    let mut sum_sq = 0.0_f64;
    for &s in samples {
        let a = (s as f64).abs();
        if !a.is_finite() {
            continue;
        }
        if a > peak {
            peak = a;
        }
        sum_sq += a * a;
        if a >= thresh as f64 {
            clipped_samples += 1;
            current_run += 1;
            if current_run > max_clip_run {
                max_clip_run = current_run;
            }
        } else {
            current_run = 0;
        }
    }
    let rms = (sum_sq / samples.len() as f64).sqrt();
    let peak_db = if peak > 1e-7 { 20.0 * peak.log10() } else { -70.0 };
    let crest_factor_db = if rms > 1e-7 && peak > 1e-7 {
        20.0 * (peak / rms).log10()
    } else {
        0.0
    };
    Ok(ClipAuditReport {
        clipped_samples,
        max_clip_run,
        peak_db,
        crest_factor_db,
        has_clipping: clipped_samples > 0,
    })
}

#[tauri::command]
pub fn audio_audit_clipping(samples: Vec<f32>, clip_threshold: Option<f32>) -> Result<ClipAuditReport, String> {
    if samples.len() > 2_000_000 {
        return Err("Clip audit input exceeds 2,000,000 samples.".into());
    }
    audit_clipping(&samples, clip_threshold.unwrap_or(0.999))
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WaveformEnvelope {
    pub bucket_count: usize,
    pub peaks: Vec<f32>,
    pub rms: Vec<f32>,
    pub duration_ms: u64,
}

pub fn compute_waveform_envelope(
    samples: &[f32],
    sample_rate: u32,
    target_buckets: usize,
) -> Result<WaveformEnvelope, String> {
    if samples.is_empty() {
        return Err("Cannot compute waveform envelope for empty audio.".into());
    }
    if sample_rate == 0 {
        return Err("Sample rate must be greater than zero.".into());
    }
    let buckets = target_buckets.clamp(1, 4096).min(samples.len());
    let mut peaks = Vec::with_capacity(buckets);
    let mut rms = Vec::with_capacity(buckets);
    let len = samples.len();
    for b in 0..buckets {
        let start = (b * len) / buckets;
        let end = (((b + 1) * len) / buckets).max(start + 1).min(len);
        let slice = &samples[start..end];
        let mut peak = 0.0_f32;
        let mut sum_sq = 0.0_f64;
        for &s in slice {
            let clean = if s.is_finite() { s.clamp(-1.0, 1.0) } else { 0.0 };
            let abs = clean.abs();
            if abs > peak {
                peak = abs;
            }
            sum_sq += (clean as f64) * (clean as f64);
        }
        peaks.push(peak);
        rms.push((sum_sq / (slice.len() as f64)).sqrt() as f32);
    }
    let duration_ms = ((len as f64) / (sample_rate as f64) * 1000.0).round() as u64;
    Ok(WaveformEnvelope {
        bucket_count: buckets,
        peaks,
        rms,
        duration_ms,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn audio_waveform_envelope(
    samples: Vec<f32>,
    sample_rate: u32,
    target_buckets: Option<usize>,
) -> Result<WaveformEnvelope, String> {
    if samples.len() > 2_000_000 {
        return Err("Waveform envelope input exceeds 2,000,000 samples.".into());
    }
    compute_waveform_envelope(&samples, sample_rate, target_buckets.unwrap_or(128))
}

#[tauri::command]
pub fn audio_region_apply(
    state: State<'_, AudioEditState>,
    region: AudioEditRegion,
) -> Result<Vec<AudioEditRegion>, String> {
    let mut guard = state.0.lock().map_err(|_| "Audio edit state unavailable.")?;
    guard.apply(region)?;
    Ok(guard.active_regions())
}

#[tauri::command]
pub fn audio_region_undo(state: State<'_, AudioEditState>) -> Result<Vec<AudioEditRegion>, String> {
    let mut guard = state.0.lock().map_err(|_| "Audio edit state unavailable.")?;
    guard.undo();
    Ok(guard.active_regions())
}

#[tauri::command]
pub fn audio_region_redo(state: State<'_, AudioEditState>) -> Result<Vec<AudioEditRegion>, String> {
    let mut guard = state.0.lock().map_err(|_| "Audio edit state unavailable.")?;
    guard.redo();
    Ok(guard.active_regions())
}
pub fn encoder(format:&str,preset:&str)->Result<Vec<&'static str>,String>{
 if !["quality","voice","compact"].contains(&preset){return Err("Unknown audio preset.".into());}
 Ok(match format{
 "mp3"=>if preset=="quality"{vec!["-c:a","libmp3lame","-b:a","320k"]}else{vec!["-c:a","libmp3lame","-b:a","128k","-ac","1","-ar","16000"]},
 "m4a"=>vec!["-c:a","aac","-b:a",if preset=="quality"{"256k"}else{"96k"},"-movflags","+faststart"],
 "opus"=>vec!["-c:a","libopus","-b:a",match preset{"quality"=>"192k","voice"=>"64k",_=>"32k"}],
 "ogg"=>vec!["-c:a","libvorbis","-q:a",if preset=="quality"{"8"}else{"3"}],
 "flac"=>vec!["-c:a","flac","-compression_level","5"],
 "wav"=>vec!["-c:a","pcm_s16le"],_=>return Err("Unsupported export format.".into())})
}
fn execute(exe:&Path,bytes:&[u8],format:&str,preset:&str,dir:&Path,cancel:&AtomicBool)->Result<PathBuf,String>{
 let args=encoder(format,preset)?;if bytes.is_empty()||bytes.len()>16_000_000{return Err("Audio input must be between 1 byte and 16 MB.".into());}
 crate::platform::ensure_private_dir(dir).map_err(|e|e.to_string())?;
 let key=crate::local_ai::random_key()?;let input=dir.join(format!("{key}.input"));let output=dir.join(format!("AnF-{key}.{format}"));
 std::fs::write(&input,bytes).map_err(|e|e.to_string())?;
 let result=(||{
  let mut command=Command::new(exe);
  command.args(["-nostdin","-hide_banner","-loglevel","error","-protocol_whitelist","file","-format_whitelist","wav,mp3,mov,ogg,flac,asf,aiff,aac","-threads","2","-i"]).arg(&input).args(["-map","0:a:0","-vn","-sn","-dn","-map_metadata","0","-threads","2"]).args(args).args(["-fs","64000000","-n"]).arg(&output).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
  #[cfg(windows)]{use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);}
  let mut child=command.spawn().map_err(|_|"The bundled audio converter could not start.".to_string())?;let started=Instant::now();
  loop{
   if cancel.load(Ordering::Relaxed)||started.elapsed()>Duration::from_secs(180){let _=child.kill();let _=child.wait();return Err("Audio conversion cancelled or exceeded the three-minute processing limit.".into());}
   match child.try_wait(){Ok(Some(status))=>{if !status.success(){return Err("This file could not be converted. Its format may be unsupported or damaged.".into());}break;},Ok(None)=>std::thread::sleep(Duration::from_millis(100)),Err(_)=>{let _=child.kill();let _=child.wait();return Err("The audio converter stopped unexpectedly.".into());}}
  }
  let size=std::fs::metadata(&output).map_err(|e|e.to_string())?.len();
  if size==0||size>=63_900_000{return Err("The converted file exceeds the 64 MB job limit. Choose a compressed format or a shorter track.".into());}
  Ok(output.clone())
 })();
 let _=std::fs::remove_file(&input);if result.is_err(){let _=std::fs::remove_file(&output);}result
}
fn executable(app:&tauri::AppHandle)->Result<PathBuf,String>{
 #[cfg(target_os="linux")]
 {
  let _=app;
  if Command::new("ffmpeg").arg("-version").output().map(|o|o.status.success()).unwrap_or(false){return Ok(PathBuf::from("ffmpeg"));}
  return Err("Install the FFmpeg package to use audio conversion on Linux.".into());
 }
 #[cfg(not(target_os="linux"))]
 {
 let bundled=app.path().resource_dir().map_err(|e|e.to_string())?.join("media/ffmpeg.exe");if bundled.is_file(){return Ok(bundled);}
 #[cfg(debug_assertions)]{let local=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../media/ffmpeg.exe");if local.is_file(){return Ok(local);}}
 Err("The native converter is missing. Install the full updated Windows package.".into())
 }
}
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SilenceTrimPlan {
    pub keep_start_sec: f64,
    pub keep_end_sec: f64,
    pub trimmed_sec: f64,
    pub original_sec: f64,
    pub threshold_db: f32,
    pub all_silent: bool,
}

/// Detect leading and trailing silence in mono PCM samples without dropping short pauses or all-silent clips.
pub fn detect_silence_regions(
    samples: &[f32],
    sample_rate: u32,
    threshold_db: f32,
    min_silence_sec: f32,
) -> Result<SilenceTrimPlan, String> {
    if samples.is_empty() || sample_rate == 0 {
        return Err("Provide non-empty audio samples and a valid sample rate.".into());
    }
    let db = threshold_db.clamp(-90.0, -5.0);
    let threshold = 10.0_f32.powf(db / 20.0);
    let min_samples = ((min_silence_sec.max(0.05) * sample_rate as f32) as usize).min(samples.len());
    let original_sec = samples.len() as f64 / sample_rate as f64;
    let first_loud = samples.iter().position(|&s| s.abs() >= threshold);
    let last_loud = samples.iter().rposition(|&s| s.abs() >= threshold);
    let (Some(start_idx), Some(end_idx)) = (first_loud, last_loud) else {
        return Ok(SilenceTrimPlan {
            keep_start_sec: 0.0,
            keep_end_sec: original_sec,
            trimmed_sec: 0.0,
            original_sec,
            threshold_db: db,
            all_silent: true,
        });
    };
    let keep_start = if start_idx >= min_samples {
        start_idx
    } else {
        0
    };
    let trailing = samples.len().saturating_sub(end_idx + 1);
    let keep_end = if trailing >= min_samples {
        end_idx + 1
    } else {
        samples.len()
    };
    let keep_start_sec = keep_start as f64 / sample_rate as f64;
    let keep_end_sec = keep_end as f64 / sample_rate as f64;
    Ok(SilenceTrimPlan {
        keep_start_sec,
        keep_end_sec,
        trimmed_sec: (original_sec - (keep_end_sec - keep_start_sec)).max(0.0),
        original_sec,
        threshold_db: db,
        all_silent: false,
    })
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LoudnessReport {
    pub integrated_lufs: f64,
    pub true_peak_db: f64,
    pub target_lufs: f64,
    pub recommended_gain: f64,
    pub gain_db: f64,
}

/// Analyze integrated loudness (RMS-based LUFS) and compute a peak-safe normalization gain.
pub fn compute_lufs_and_gain(samples: &[f32], target_lufs: f64) -> Result<LoudnessReport, String> {
    if samples.is_empty() {
        return Err("Provide non-empty audio samples for loudness analysis.".into());
    }
    let target = target_lufs.clamp(-36.0, -6.0);
    let mut sum_sq = 0.0_f64;
    let mut peak = 0.0_f64;
    for &s in samples {
        let v = (s as f64).abs();
        if v.is_finite() {
            sum_sq += v * v;
            if v > peak {
                peak = v;
            }
        }
    }
    let rms = (sum_sq / samples.len() as f64).sqrt();
    if rms <= 1e-7 || peak <= 1e-7 {
        return Ok(LoudnessReport {
            integrated_lufs: -70.0,
            true_peak_db: -70.0,
            target_lufs: target,
            recommended_gain: 1.0,
            gain_db: 0.0,
        });
    }
    let integrated_lufs = 20.0 * rms.log10() - 0.691;
    let true_peak_db = 20.0 * peak.log10();
    let desired_db = target - integrated_lufs;
    // Prevent clipping by capping gain so peak stays <= -0.5 dBFS.
    let max_safe_db = -0.5 - true_peak_db;
    let applied_db = desired_db.min(max_safe_db).clamp(-24.0, 24.0);
    let recommended_gain = 10.0_f64.powf(applied_db / 20.0);
    Ok(LoudnessReport {
        integrated_lufs,
        true_peak_db,
        target_lufs: target,
        recommended_gain,
        gain_db: applied_db,
    })
}

/// Generate a normalized crossfade gain curve [(fade_out, fade_in), ...] across `steps` points.
pub fn compute_crossfade_gains(curve: &str, steps: usize) -> Result<Vec<(f32, f32)>, String> {
    if steps < 2 || steps > 1024 {
        return Err("Crossfade steps must be between 2 and 1024.".into());
    }
    if !matches!(curve, "equal-power" | "linear" | "s-curve") {
        return Err("Unknown crossfade curve. Use equal-power, linear, or s-curve.".into());
    }
    let mut out = Vec::with_capacity(steps);
    for i in 0..steps {
        let t = i as f32 / (steps - 1) as f32;
        let (fade_out, fade_in) = match curve {
            "linear" => (1.0 - t, t),
            "s-curve" => {
                let s = t * t * (3.0 - 2.0 * t);
                (1.0 - s, s)
            }
            _ => {
                let angle = t * std::f32::consts::FRAC_PI_2;
                (angle.cos(), angle.sin())
            }
        };
        out.push((fade_out, fade_in));
    }
    Ok(out)
}

#[tauri::command]
pub fn audio_analyze_loudness(samples: Vec<f32>, target_lufs: Option<f64>) -> Result<LoudnessReport, String> {
    if samples.len() > 2_000_000 {
        return Err("Loudness analysis input exceeds 2,000,000 samples.".into());
    }
    compute_lufs_and_gain(&samples, target_lufs.unwrap_or(-14.0))
}

#[tauri::command]
pub fn audio_crossfade_curve(curve: String, steps: Option<usize>) -> Result<Vec<(f32, f32)>, String> {
    compute_crossfade_gains(&curve, steps.unwrap_or(32))
}

#[tauri::command]
pub fn audio_detect_silence(
    samples: Vec<f32>,
    sample_rate: u32,
    threshold_db: Option<f32>,
    min_silence_sec: Option<f32>,
) -> Result<SilenceTrimPlan, String> {
    if samples.len() > 2_000_000 {
        return Err("Silence analysis input exceeds 2,000,000 samples.".into());
    }
    detect_silence_regions(
        &samples,
        sample_rate,
        threshold_db.unwrap_or(-42.0),
        min_silence_sec.unwrap_or(0.25),
    )
}

#[tauri::command]pub fn audio_conversion_cancel(jobs:State<AudioJobs>,id:String){if let Ok(guard)=jobs.0.lock(){if let Some((active,cancel))=guard.as_ref(){if active==&id{cancel.store(true,Ordering::Relaxed);}}}}
#[tauri::command]pub async fn audio_convert(app:tauri::AppHandle,jobs:State<'_,AudioJobs>,id:String,bytes:Vec<u8>,format:String,preset:String)->Result<String,String>{
 if id.len()>64||id.is_empty()||!id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'){return Err("Invalid audio job.".into());}
 encoder(&format,&preset)?;if bytes.len()>16_000_000{return Err("Choose an audio file under 16 MB.".into());}
 let exe=executable(&app)?;let cancel=Arc::new(AtomicBool::new(false));
 {let mut guard=jobs.0.lock().map_err(|_|"Audio job lock unavailable.")?;if guard.is_some(){return Err("An audio conversion is already running.".into());}*guard=Some((id,cancel.clone()));}
 let result=tokio::task::spawn_blocking(move||execute(&exe,&bytes,&format,&preset,&crate::settings::local_dir().join("documents/audio-exports"),&cancel)).await.map_err(|_|"Audio conversion stopped.".to_string()).and_then(|r|r).map(|p|p.to_string_lossy().to_string());
 if let Ok(mut guard)=jobs.0.lock(){*guard=None;}result
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn presets_are_allowlisted(){assert!(encoder("../mp3","quality").is_err());assert!(encoder("mp3","-y").is_err());assert!(encoder("opus","compact").unwrap().contains(&"32k"));assert!(encoder("mp3","voice").unwrap().contains(&"16000"));for format in ["mp3","m4a","opus","ogg","flac","wav"]{assert!(encoder(format,"quality").is_ok());}}
 #[test]fn silence_detection_trims_edges_and_preserves_all_silent(){
  let mut pcm=vec![0.0_f32;8000];
  pcm.extend(vec![0.4_f32;8000]);
  pcm.extend(vec![0.0_f32;8000]);
  let plan=detect_silence_regions(&pcm,16000,-40.0,0.25).unwrap();
  assert!(!plan.all_silent);
  assert!((plan.keep_start_sec-0.5).abs()<0.01);
  assert!((plan.keep_end_sec-1.0).abs()<0.01);
  assert!((plan.trimmed_sec-1.0).abs()<0.01);
  let silent=vec![0.0_f32;16000];
  let preserved=detect_silence_regions(&silent,16000,-40.0,0.25).unwrap();
  assert!(preserved.all_silent);
  assert_eq!(preserved.trimmed_sec,0.0);
  assert!(detect_silence_regions(&[],16000,-40.0,0.25).is_err());
 }
 #[test]fn loudness_and_crossfade_curves_are_peak_safe(){
  let tone=vec![0.05_f32;16000];
  let report=compute_lufs_and_gain(&tone,-14.0).unwrap();
  assert!(report.recommended_gain>1.0);
  assert!(report.true_peak_db+report.gain_db<=-0.49);
  assert!(compute_lufs_and_gain(&[],-14.0).is_err());
  let ep=compute_crossfade_gains("equal-power",17).unwrap();
  assert_eq!(ep.len(),17);
  for (out_g,in_g) in &ep{assert!(((out_g*out_g+in_g*in_g)-1.0).abs()<1e-4);}
  assert!(compute_crossfade_gains("unknown",16).is_err());
 }
 #[test]fn region_history_supports_apply_undo_redo_and_clears_redo_on_new_edit(){
  let mut hist=AudioEditHistory::default();
  hist.apply(AudioEditRegion{kind:"trim".into(),start_sec:0.5,end_sec:10.0,gain:1.0}).unwrap();
  hist.apply(AudioEditRegion{kind:"gain".into(),start_sec:1.0,end_sec:3.0,gain:0.8}).unwrap();
  assert_eq!(hist.active_regions().len(),2);
  let undone=hist.undo().unwrap();
  assert_eq!(undone.kind,"gain");
  assert_eq!(hist.active_regions().len(),1);
  let redone=hist.redo().unwrap();
  assert_eq!(redone.kind,"gain");
  assert_eq!(hist.active_regions().len(),2);
  hist.undo();
  hist.apply(AudioEditRegion{kind:"mute".into(),start_sec:2.0,end_sec:4.0,gain:0.0}).unwrap();
  assert!(hist.redo().is_none());
  assert!(hist.apply(AudioEditRegion{kind:"bad".into(),start_sec:0.0,end_sec:1.0,gain:1.0}).is_err());
 }
 #[test]fn queue_history_and_per_item_speed_memory_work(){
  let mut q=AudioQueueInner::default();
  q.push_up_next("t1".into());
  q.push_up_next("t2".into());
  assert_eq!(q.advance_next().as_deref(),Some("t1"));
  assert_eq!(q.advance_next().as_deref(),Some("t2"));
  assert_eq!(q.go_previous().as_deref(),Some("t1"));
  assert_eq!(q.advance_next().as_deref(),Some("t2"));
  assert_eq!(q.set_speed("t1".into(),4.5),3.0);
  assert_eq!(q.get_speed("t1"),3.0);
  assert_eq!(q.get_speed("missing"),1.0);
 }
 #[test]fn media_session_handles_transport_keys_and_bounds(){
  let mut ms=MediaSessionState{title:"Track".into(),artist:"Artist".into(),duration_sec:60.0,position_sec:50.0,playback_rate:1.0,playing:false};
  ms.apply_key("play").unwrap();
  assert!(ms.playing);
  ms.apply_key("seek_forward").unwrap();
  assert_eq!(ms.position_sec,60.0);
  ms.apply_key("seek_backward").unwrap();
  assert_eq!(ms.position_sec,45.0);
  assert!(ms.apply_key("invalid_key").is_err());
 }
 #[test]fn batch_presets_and_validation_enforce_limits(){
  let presets=audio_list_presets();
  assert!(presets.iter().all(|p|encoder(p.format,p.preset).is_ok()));
  assert!(audio_validate_batch_job(5,1024,"opus".into(),"voice".into()).is_ok());
  assert!(audio_validate_batch_job(0,1024,"opus".into(),"voice".into()).is_err());
  assert!(audio_validate_batch_job(5,1024,"exe".into(),"voice".into()).is_err());
 }
 #[test]fn gapless_transition_planner_computes_preload_and_clamps_crossfade(){
  let early=plan_gapless_transition(60.0,10.0,5.0,2.0).unwrap();
  assert!(!early.should_preload);
  assert_eq!(early.ms_until_preload,45_000);
  let near_end=plan_gapless_transition(10.0,8.0,4.0,8.0).unwrap();
  assert!(near_end.should_preload);
  assert_eq!(near_end.crossfade_sec,4.0);
  assert!(plan_gapless_transition(0.0,0.0,4.0,1.0).is_err());
 }
 #[test]fn adversarial_nan_and_negative_audio_inputs_are_safe(){
  assert!(compute_lufs_and_gain(&[f32::NAN,0.0,f32::INFINITY],-14.0).is_ok());
  assert!(plan_gapless_transition(f64::NAN,0.0,4.0,1.0).is_err());
  assert!(plan_gapless_transition(10.0,-1.0,4.0,1.0).is_err());
  let mut q=AudioQueueInner::default();
  assert_eq!(q.set_speed("x".into(),f64::NAN),1.0);
 }
 #[test]fn clip_audit_detects_clipped_runs_and_crest_factor(){
  let mut pcm=vec![0.2_f32;100];
  pcm[10]=1.0;pcm[11]=1.0;pcm[12]=1.0;
  let rep=audit_clipping(&pcm,0.999).unwrap();
  assert!(rep.has_clipping);
  assert_eq!(rep.clipped_samples,3);
  assert_eq!(rep.max_clip_run,3);
  assert!(audit_clipping(&[],0.999).is_err());
 }
 #[test]fn waveform_envelope_downsamples_and_sanitizes_non_finite(){
  let mut pcm=vec![0.5_f32;100];
  pcm[5]=f32::NAN;pcm[60]=2.5;
  let env=compute_waveform_envelope(&pcm,1000,10).unwrap();
  assert_eq!(env.bucket_count,10);
  assert_eq!(env.peaks.len(),10);
  assert_eq!(env.rms.len(),10);
  assert_eq!(env.duration_ms,100);
  assert!((env.peaks[6]-1.0).abs()<1e-5);
  assert!(compute_waveform_envelope(&[],1000,10).is_err());
  assert!(compute_waveform_envelope(&pcm,0,10).is_err());
 }
 #[test]#[ignore="Requires the downloaded Windows FFmpeg runtime"]fn converts_all_formats(){let base=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../..");let exe=base.join("work/coucou/windows/media/ffmpeg.exe");let input=std::fs::read(base.join("work/audio-fixtures/Quiet tone A.wav")).unwrap();let dir=base.join("work/audio-native-check");for format in ["mp3","m4a","opus","ogg","flac","wav"]{let path=execute(&exe,&input,format,"voice",&dir,&AtomicBool::new(false)).unwrap();assert!(path.metadata().unwrap().len()>100);}assert!(execute(&exe,&input,"opus","voice",&dir,&AtomicBool::new(true)).is_err());}
}
