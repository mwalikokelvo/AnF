//! Bounded, local-only FFmpeg jobs. User paths and encoder arguments never enter a shell.
use serde::Serialize;
use std::{path::{Path,PathBuf},sync::{Arc,Mutex,atomic::{AtomicBool,Ordering}},process::{Command,Stdio},time::{Duration,Instant}};
use tauri::State;
#[cfg(not(target_os="linux"))]
use tauri::Manager;
#[derive(Default)]pub struct AudioJobs(Mutex<Option<(String,Arc<AtomicBool>)>>);
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
 #[test]#[ignore="Requires the downloaded Windows FFmpeg runtime"]fn converts_all_formats(){let base=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../..");let exe=base.join("work/coucou/windows/media/ffmpeg.exe");let input=std::fs::read(base.join("work/audio-fixtures/Quiet tone A.wav")).unwrap();let dir=base.join("work/audio-native-check");for format in ["mp3","m4a","opus","ogg","flac","wav"]{let path=execute(&exe,&input,format,"voice",&dir,&AtomicBool::new(false)).unwrap();assert!(path.metadata().unwrap().len()>100);}assert!(execute(&exe,&input,"opus","voice",&dir,&AtomicBool::new(true)).is_err());}
}
