// SPDX-License-Identifier: MIT
//! Fail-closed runtime inventory. The manifest must be compiled into reviewed
//! AnF source, never supplied by the renderer or read as an untrusted sibling.
use super::Result;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{File, OpenOptions};
use std::io::Read;
use std::os::windows::fs::{MetadataExt, OpenOptionsExt};
use std::path::{Path, PathBuf};
use std::process::Command;

const ERROR: &str = "MKR packaged runtime is missing, changed or unsupported.";
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    schema: u32,
    java: String,
    classpath: Vec<String>,
    files: BTreeMap<String, String>,
}
pub struct VerifiedRuntime {
    root: PathBuf,
    java: String,
    classpath: Vec<String>,
    // Deny writes/deletion while the owned child uses these exact verified files.
    _locks: Vec<File>,
}
// Tauri returns canonical verbatim DOS paths (\\?\C:\...). Java's class loader
// does not understand that namespace. Use the equivalent DOS spelling ONLY
// when Win32 normalization cannot change which verified, locked file is opened.
fn java_path(path: &Path) -> Result<PathBuf> {
    let text = path.to_str().ok_or(ERROR)?.replace('/', "\\");
    let dos = text.strip_prefix(r"\\?\").unwrap_or(&text);
    let bytes = dos.as_bytes();
    if bytes.len() < 4 || !bytes[0].is_ascii_alphabetic() || bytes[1] != b':' || bytes[2] != b'\\' {
        return Err(ERROR.into());
    }
    for part in dos[3..].split('\\') {
        if part.is_empty()
            || part == "."
            || part == ".."
            || part.ends_with([' ', '.'])
            || part
                .chars()
                .any(|c| c.is_control() || r#":;*?"<>|"#.contains(c))
        {
            return Err(ERROR.into());
        }
        let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
        if matches!(
            stem.as_str(),
            "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$" | "CLOCK$"
        ) || ["COM", "LPT"].iter().any(|prefix| {
            stem.strip_prefix(prefix).is_some_and(|tail| {
                matches!(
                    tail,
                    "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                )
            })
        }) {
            return Err(ERROR.into());
        }
    }
    Ok(PathBuf::from(dos))
}
fn relative(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value.split('/').all(|part| {
            !part.is_empty()
                && part != "."
                && part != ".."
                && part
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
        })
}
fn inventory(root: &Path, dir: &Path, depth: usize, files: &mut BTreeSet<String>) -> Result<()> {
    let metadata = std::fs::symlink_metadata(dir).map_err(|_| ERROR)?;
    if depth > 16 || metadata.file_attributes() & 0x400 != 0 {
        return Err(ERROR.into());
    }
    for entry in std::fs::read_dir(dir).map_err(|_| ERROR)? {
        let path = entry.map_err(|_| ERROR)?.path();
        let metadata = std::fs::symlink_metadata(&path).map_err(|_| ERROR)?;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(ERROR.into());
        }
        if metadata.is_dir() {
            inventory(root, &path, depth + 1, files)?
        } else if metadata.is_file() {
            let value = path
                .strip_prefix(root)
                .map_err(|_| ERROR)?
                .to_str()
                .ok_or(ERROR)?
                .replace('\\', "/");
            if !relative(&value) || files.len() >= 4096 {
                return Err(ERROR.into());
            }
            files.insert(value);
        } else {
            return Err(ERROR.into());
        }
    }
    Ok(())
}
impl VerifiedRuntime {
    /// Pass an include_str! manifest from the reviewed release source. No default
    /// or downloadable manifest exists yet, so missing packaging stays unavailable.
    pub fn verify(root: &Path, pinned_manifest: &'static str) -> Result<Self> {
        if !root.is_absolute() || pinned_manifest.len() > 524_288 {
            return Err(ERROR.into());
        }
        let spec: Manifest = serde_json::from_str(pinned_manifest).map_err(|_| ERROR)?;
        if spec.schema != 1
            || spec.files.is_empty()
            || spec.files.len() > 4096
            || !relative(&spec.java)
            || !(spec.java == "bin/java.exe" || spec.java.ends_with("/bin/java.exe"))
            || spec.classpath.is_empty()
            || spec.classpath.len() > 256
            || !spec.files.contains_key(&spec.java)
            || spec.files.iter().any(|(path, hash)| {
                !relative(path)
                    || hash.len() != 64
                    || !hash
                        .bytes()
                        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            })
            || spec
                .classpath
                .iter()
                .any(|p| !relative(p) || !p.ends_with(".jar") || !spec.files.contains_key(p))
        {
            return Err(ERROR.into());
        }
        let mut actual = BTreeSet::new();
        inventory(root, root, 0, &mut actual)?;
        if actual != spec.files.keys().cloned().collect() {
            return Err(ERROR.into());
        }
        let mut locks = Vec::new();
        let mut total = 0u64;
        for (relative, expected) in &spec.files {
            let mut file = OpenOptions::new()
                .read(true)
                .share_mode(1)
                .open(root.join(relative))
                .map_err(|_| ERROR)?;
            let mut digest = Sha256::new();
            let mut size = 0u64;
            let mut buffer = [0u8; 65_536];
            loop {
                let count = file.read(&mut buffer).map_err(|_| ERROR)?;
                if count == 0 {
                    break;
                }
                size += count as u64;
                total += count as u64;
                if size > 536_870_912 || total > 1_073_741_824 {
                    return Err(ERROR.into());
                }
                digest.update(&buffer[..count]);
            }
            if format!("{:x}", digest.finalize()) != *expected {
                return Err(ERROR.into());
            }
            locks.push(file);
        }
        Ok(Self {
            root: root.into(),
            java: spec.java,
            classpath: spec.classpath,
            _locks: locks,
        })
    }
    pub(super) fn command(&self) -> Result<Command> {
        let paths: Vec<PathBuf> = self
            .classpath
            .iter()
            .map(|p| java_path(&self.root.join(p)))
            .collect::<Result<_>>()?;
        let classpath = std::env::join_paths(paths).map_err(|_| ERROR)?;
        if classpath.len() > 24_000 {
            return Err(ERROR.into());
        }
        let system = std::env::var_os("SystemRoot").ok_or(ERROR)?;
        // The launcher also derives java.home from argv[0]. A verbatim program
        // spelling can crash HotSpot's jimage loader even with a normal -cp.
        let mut command = Command::new(java_path(&self.root.join(&self.java))?);
        // Credentials, proxy/account cookies and Java injection options are not
        // inherited by the catalog child. No shell or UI-selected arguments.
        command
            .env_clear()
            .env("SystemRoot", &system)
            .env("WINDIR", &system)
            .env("TEMP", std::env::temp_dir())
            .env("TMP", std::env::temp_dir())
            .current_dir(java_path(&self.root)?)
            .arg("-Xmx256m")
            .arg("-XX:ActiveProcessorCount=2")
            .arg("-cp")
            .arg(classpath)
            .arg("com.anf.mkr.windows.WindowsCatalogSidecarKt");
        Ok(command)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    #[test]
    #[ignore = "explicit disposable generated-catalog runtime only"]
    fn real_canonical_generated_catalog_runtime_handshake() {
        let root = PathBuf::from(
            std::env::var_os("ANF_MKR_QA_RUNTIME").expect("select disposable QA runtime"),
        );
        assert_eq!(root.file_name().unwrap(), "mkr-runtime");
        let parent = root.parent().unwrap().parent().unwrap();
        assert!(parent
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("mkr-workspace-qa-"));
        let manifest = std::fs::read_to_string(
            parent.join("source/windows/src-tauri/mkr-engineering-manifest.json"),
        )
        .unwrap();
        let verified = VerifiedRuntime::verify(
            &std::fs::canonicalize(root).unwrap(),
            Box::leak(manifest.into_boxed_str()),
        )
        .unwrap();
        let mut catalog =
            crate::catalog::CatalogProcess::launch(verified).expect("generated catalog handshake");
        assert_eq!(catalog.search("fixture").unwrap().len(), 2);
        catalog.release().unwrap();
    }
    #[test]
    fn java_classpath_handles_tauri_canonical_dos_without_namespace_aliases() {
        assert_eq!(
            java_path(Path::new(r"\\?\C:\An F\lib\catalog.jar")).unwrap(),
            PathBuf::from(r"C:\An F\lib\catalog.jar")
        );
        assert_eq!(
            java_path(Path::new("C:/AnF/é/lib/catalog.jar")).unwrap(),
            PathBuf::from(r"C:\AnF\é\lib\catalog.jar")
        );
        for path in [
            r"\\?\UNC\host\share\lib.jar",
            r"\\host\share\lib.jar",
            r"\\.\C:\lib.jar",
            r"lib.jar",
            r"C:\AnF.\lib.jar",
            r"C:\AnF \lib.jar",
            r"C:\AnF\..\lib.jar",
            r"C:\AnF\lib.jar:stream",
            r"C:\AnF\NUL.jar",
            r"C:\AnF\CONIN$",
            r"C:\AnF;other\lib.jar",
            r"C:\AnF\COM¹.jar",
            r"C:\AnF\\lib.jar",
        ] {
            assert!(
                java_path(Path::new(path)).is_err(),
                "unsafe Java path accepted"
            );
        }
    }
    #[test]
    #[ignore = "explicit freshly prepared engineering runtime only; no provider calls"]
    fn real_candidate_inventory_and_child_handshake() {
        let root = PathBuf::from(
            std::env::var_os("ANF_MKR_CANDIDATE_BUNDLE")
                .expect("prepare/select a fresh engineering candidate"),
        );
        assert_eq!(root.file_name().unwrap(), "bundle");
        let parent = root.parent().unwrap();
        let status: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(parent.join("candidate-status.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(status["engineeringOnly"], true);
        assert_eq!(status["readyForPublication"], false);
        assert_eq!(status["sourceCompleteDistributionPrepared"], false);
        // Engineering test only: this manifest is generated from fresh build
        // outputs, NOT a reviewed immutable production source pin.
        let manifest = std::fs::read_to_string(parent.join("runtime-manifest.json")).unwrap();
        let pinned: &'static str = Box::leak(manifest.into_boxed_str());
        // Match Tauri's actual resource_dir representation, not just a manually
        // supplied DOS path. This used to pass inventory but fail JVM startup.
        let canonical = std::fs::canonicalize(&root).unwrap();
        let verified = VerifiedRuntime::verify(&canonical, pinned)
            .expect("actual complete candidate inventory and file locks");
        let mut catalog = crate::catalog::CatalogProcess::launch(verified)
            .expect("actual candidate JVM and packaged classpath handshake");
        catalog
            .release()
            .expect("actual private-pipe RPC without provider request");
        drop(catalog);
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let Ok(root) = self.0.canonicalize() else {
                return;
            };
            let Ok(temp) = std::env::temp_dir().canonicalize() else {
                return;
            };
            if root.starts_with(&temp)
                && root
                    .file_name()
                    .is_some_and(|n| n.to_string_lossy().starts_with("anf-mkr-resource-fixture-"))
            {
                let _ = std::fs::remove_dir_all(root);
            }
        }
    }
    #[test]
    fn pinned_inventory_rejects_extra_changed_and_traversal_files_and_holds_write_locks() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let fixture = Fixture(std::env::temp_dir().join(format!(
            "anf-mkr-resource-fixture-{}-{stamp}",
            std::process::id()
        )));
        std::fs::create_dir(&fixture.0).unwrap();
        std::fs::create_dir(fixture.0.join("bin")).unwrap();
        std::fs::write(
            fixture.0.join("bin/java.exe"),
            b"generated not-executable fixture",
        )
        .unwrap();
        std::fs::write(fixture.0.join("catalog.jar"), b"generated source fixture").unwrap();
        let mut files = BTreeMap::new();
        for path in ["bin/java.exe", "catalog.jar"] {
            files.insert(
                path,
                format!(
                    "{:x}",
                    Sha256::digest(std::fs::read(fixture.0.join(path)).unwrap())
                ),
            );
        }
        let manifest = serde_json::json!({"schema":1,"java":"bin/java.exe","classpath":["catalog.jar"],"files":files});
        let pinned: &'static str = Box::leak(manifest.to_string().into_boxed_str());
        let verified = VerifiedRuntime::verify(&fixture.0, pinned).unwrap();
        assert!(
            OpenOptions::new()
                .write(true)
                .open(fixture.0.join("catalog.jar"))
                .is_err(),
            "verified file remained writable"
        );
        drop(verified);
        std::fs::write(fixture.0.join("extra.dll"), b"unlisted").unwrap();
        assert!(VerifiedRuntime::verify(&fixture.0, pinned).is_err());
        std::fs::remove_file(fixture.0.join("extra.dll")).unwrap();
        std::fs::write(fixture.0.join("catalog.jar"), b"changed").unwrap();
        assert!(VerifiedRuntime::verify(&fixture.0, pinned).is_err());
        for value in [
            "../private",
            "/absolute",
            "C:/private",
            "bin\\java.exe",
            "bin//java.exe",
        ] {
            assert!(!relative(value))
        }
    }
}
