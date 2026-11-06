//! Where verified models live and how a download becomes "installed". std-only
//! so it compiles with plain `rustc --test`. The rule that matters: the final
//! file name is only ever created by renaming a `.part` file whose SHA-256 has
//! just been checked, and a sidecar records that check. A partial file is
//! never at the final name, so it can never be mistaken for an install.
use super::policy::{digest_matches, hex, is_installed, plan_resume, ModelSpec, ResumePlan};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

pub fn models_dir(local_dir: &Path) -> PathBuf {
    local_dir.join("local-ai").join("models")
}
pub fn final_path(dir: &Path, spec: &ModelSpec) -> PathBuf {
    dir.join(spec.file)
}
pub fn part_path(dir: &Path, spec: &ModelSpec) -> PathBuf {
    dir.join(format!("{}.part", spec.file))
}
pub fn sidecar_path(dir: &Path, spec: &ModelSpec) -> PathBuf {
    dir.join(format!("{}.sha256", spec.file))
}

fn len_of(p: &Path) -> Option<u64> {
    fs::metadata(p).ok().filter(|m| m.is_file()).map(|m| m.len())
}

pub fn part_len(dir: &Path, spec: &ModelSpec) -> Option<u64> {
    len_of(&part_path(dir, spec))
}

/// Installed = exact size at the final name AND a sidecar holding the pinned hash.
pub fn installed(dir: &Path, spec: &ModelSpec) -> bool {
    let sidecar = fs::read_to_string(sidecar_path(dir, spec)).ok();
    is_installed(spec, len_of(&final_path(dir, spec)), sidecar.as_deref())
}

/// A final-named file of the right size that has no verification record yet
/// (for example a crash between rename and sidecar). It must be hashed before use.
pub fn needs_adoption(dir: &Path, spec: &ModelSpec) -> bool {
    !installed(dir, spec) && len_of(&final_path(dir, spec)) == Some(spec.size)
}

/// Prepare the part file for writing and say where the transfer starts.
/// A leftover part is resumed; an unusable one (empty or oversized) is truncated.
pub fn open_part(dir: &Path, spec: &ModelSpec) -> io::Result<(File, ResumePlan)> {
    fs::create_dir_all(dir)?;
    let path = part_path(dir, spec);
    let plan = plan_resume(len_of(&path), spec.size);
    let file = match plan {
        ResumePlan::Resume(_) | ResumePlan::Verify => OpenOptions::new().append(true).open(&path)?,
        ResumePlan::Fresh => OpenOptions::new().write(true).create(true).truncate(true).open(&path)?,
    };
    Ok((file, plan))
}

/// The server ignored a Range request: throw the old bytes away and start over.
pub fn restart_part(dir: &Path, spec: &ModelSpec) -> io::Result<File> {
    OpenOptions::new().write(true).create(true).truncate(true).open(part_path(dir, spec))
}

pub fn discard_part(dir: &Path, spec: &ModelSpec) {
    let _ = fs::remove_file(part_path(dir, spec));
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    Part,
    /// A final-named file that was found without a verification record.
    Existing,
}

/// Turn a hashed file into an installed model, or delete it. On any mismatch the
/// bytes are removed so a bad file is never retried or resumed.
pub fn finalize(dir: &Path, spec: &ModelSpec, digest: &[u8], source: Source) -> Result<(), String> {
    let from = match source {
        Source::Part => part_path(dir, spec),
        Source::Existing => final_path(dir, spec),
    };
    let remove_bad = || {
        let _ = fs::remove_file(&from);
        if source == Source::Existing {
            let _ = fs::remove_file(sidecar_path(dir, spec));
        }
    };
    if len_of(&from) != Some(spec.size) {
        remove_bad();
        return Err("The downloaded file has the wrong size and was deleted.".into());
    }
    if !digest_matches(spec.sha256, digest) {
        remove_bad();
        return Err(format!(
            "Checksum mismatch: the file's SHA-256 is {} but {} was expected. The file was deleted and not installed.",
            hex(digest),
            spec.sha256
        ));
    }
    let target = final_path(dir, spec);
    if source == Source::Part {
        let _ = fs::remove_file(sidecar_path(dir, spec));
        let _ = fs::remove_file(&target); // Windows cannot rename over an existing file
        fs::rename(&from, &target).map_err(|e| format!("Could not move the verified file into place: {e}"))?;
    }
    let tmp = dir.join(format!("{}.sha256.tmp", spec.file));
    let write = (|| -> io::Result<()> {
        let mut f = File::create(&tmp)?;
        f.write_all(spec.sha256.as_bytes())?;
        f.sync_all()?;
        let _ = fs::remove_file(sidecar_path(dir, spec));
        fs::rename(&tmp, sidecar_path(dir, spec))
    })();
    write.map_err(|e| format!("Could not record the verification: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    // sha256("hello")
    const HELLO: [u8; 32] = [
        0x2c, 0xf2, 0x4d, 0xba, 0x5f, 0xb0, 0xa3, 0x0e, 0x26, 0xe8, 0x3b, 0x2a, 0xc5, 0xb9, 0xe2, 0x9e, 0x1b, 0x16, 0x1e, 0x5c, 0x1f, 0xa7, 0x42, 0x5e, 0x73, 0x04, 0x33, 0x62,
        0x93, 0x8b, 0x98, 0x24,
    ];
    const TINY: ModelSpec = ModelSpec {
        id: "tiny",
        file: "tiny.gguf",
        url: "https://huggingface.co/x/y/resolve/main/tiny.gguf",
        sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        size: 5,
    };

    fn tmp() -> PathBuf {
        static N: AtomicU32 = AtomicU32::new(0);
        let d = std::env::temp_dir().join(format!("anf-store-test-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn layout_is_under_local_ai_models() {
        let d = models_dir(Path::new("data"));
        assert!(d.ends_with(Path::new("local-ai").join("models")));
        assert_eq!(part_path(&d, &TINY).file_name().unwrap(), "tiny.gguf.part");
    }

    #[test]
    fn a_partial_file_is_never_installed() {
        let d = tmp();
        fs::write(part_path(&d, &TINY), b"hel").unwrap();
        assert!(!installed(&d, &TINY));
        assert!(!needs_adoption(&d, &TINY));
        // even a complete-size part is not installed until finalized
        fs::write(part_path(&d, &TINY), b"hello").unwrap();
        assert!(!installed(&d, &TINY));
        assert_eq!(part_len(&d, &TINY), Some(5));
    }

    #[test]
    fn good_digest_promotes_part_and_records_verification() {
        let d = tmp();
        fs::write(part_path(&d, &TINY), b"hello").unwrap();
        finalize(&d, &TINY, &HELLO, Source::Part).unwrap();
        assert!(installed(&d, &TINY));
        assert!(!part_path(&d, &TINY).exists());
        assert_eq!(fs::read(final_path(&d, &TINY)).unwrap(), b"hello");
    }

    #[test]
    fn bad_digest_deletes_the_bytes_and_installs_nothing() {
        let d = tmp();
        fs::write(part_path(&d, &TINY), b"HELLO").unwrap(); // right size, wrong content
        let mut wrong = HELLO;
        wrong[0] ^= 0xff;
        let err = finalize(&d, &TINY, &wrong, Source::Part).unwrap_err();
        assert!(err.contains("Checksum mismatch"), "{err}");
        assert!(!part_path(&d, &TINY).exists());
        assert!(!final_path(&d, &TINY).exists());
        assert!(!installed(&d, &TINY));
    }

    #[test]
    fn wrong_size_is_rejected_even_with_a_matching_digest_argument() {
        let d = tmp();
        fs::write(part_path(&d, &TINY), b"hello!!").unwrap();
        assert!(finalize(&d, &TINY, &HELLO, Source::Part).is_err());
        assert!(!part_path(&d, &TINY).exists() && !installed(&d, &TINY));
    }

    #[test]
    fn a_failed_verification_does_not_clobber_a_previous_good_install() {
        let d = tmp();
        fs::write(part_path(&d, &TINY), b"hello").unwrap();
        finalize(&d, &TINY, &HELLO, Source::Part).unwrap();
        fs::write(part_path(&d, &TINY), b"HELLO").unwrap();
        assert!(finalize(&d, &TINY, &[0u8; 32], Source::Part).is_err());
        assert!(installed(&d, &TINY), "the earlier verified file stays");
    }

    #[test]
    fn final_named_file_without_a_record_is_not_installed_until_hashed() {
        let d = tmp();
        fs::write(final_path(&d, &TINY), b"hello").unwrap();
        assert!(!installed(&d, &TINY));
        assert!(needs_adoption(&d, &TINY));
        finalize(&d, &TINY, &HELLO, Source::Existing).unwrap();
        assert!(installed(&d, &TINY));
        // a tampered one is deleted
        let d2 = tmp();
        fs::write(final_path(&d2, &TINY), b"hellO").unwrap();
        assert!(finalize(&d2, &TINY, &[1u8; 32], Source::Existing).is_err());
        assert!(!final_path(&d2, &TINY).exists());
    }

    #[test]
    fn truncated_or_swapped_install_is_detected() {
        let d = tmp();
        fs::write(part_path(&d, &TINY), b"hello").unwrap();
        finalize(&d, &TINY, &HELLO, Source::Part).unwrap();
        fs::write(final_path(&d, &TINY), b"hel").unwrap();
        assert!(!installed(&d, &TINY));
        fs::write(sidecar_path(&d, &TINY), "00").unwrap();
        fs::write(final_path(&d, &TINY), b"hello").unwrap();
        assert!(!installed(&d, &TINY), "a wrong sidecar does not count");
    }

    #[test]
    fn open_part_resumes_appends_and_truncates() {
        let d = tmp();
        let (mut f, plan) = open_part(&d, &TINY).unwrap();
        assert_eq!(plan, ResumePlan::Fresh);
        f.write_all(b"he").unwrap();
        drop(f);
        let (mut f, plan) = open_part(&d, &TINY).unwrap();
        assert_eq!(plan, ResumePlan::Resume(2));
        f.write_all(b"llo").unwrap();
        drop(f);
        assert_eq!(fs::read(part_path(&d, &TINY)).unwrap(), b"hello");
        let (_f, plan) = open_part(&d, &TINY).unwrap();
        assert_eq!(plan, ResumePlan::Verify);
        // oversized junk is truncated
        fs::write(part_path(&d, &TINY), b"too long!").unwrap();
        let (_f, plan) = open_part(&d, &TINY).unwrap();
        assert_eq!(plan, ResumePlan::Fresh);
        assert_eq!(part_len(&d, &TINY), Some(0));
        discard_part(&d, &TINY);
        assert_eq!(part_len(&d, &TINY), None);
    }
}
