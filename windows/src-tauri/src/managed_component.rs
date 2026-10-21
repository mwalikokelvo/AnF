//! Offline optional-component installation. No npm, archive extraction or network.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
pub const EXPECTED_MANIFEST: &str =
    "9db5aec18cfc8f2e8a5ae160056b2b728a444b88eda0ac4c202bdfa12361bafb";
const MAX_BYTES: u64 = 8 * 1024 * 1024 * 1024;
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub schema: u32,
    pub platform: String,
    pub version: String,
    #[serde(rename = "nodeVersion")]
    pub node_version: String,
    pub node: String,
    pub entry: String,
    pub files: Vec<Entry>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Entry {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}
#[derive(Default)]
pub struct Progress {
    pub epoch: AtomicU64,
    pub done: Arc<AtomicU64>,
    pub total: Arc<AtomicU64>,
    pub phase: Arc<Mutex<String>>,
}
impl Progress {
    /// Begin a visible phase without reusing the preceding phase's byte count.
    pub fn begin(&self, phase: &str) {
        let mut current = self.phase.lock().unwrap();
        self.total.store(0, Ordering::Relaxed);
        self.done.store(0, Ordering::Relaxed);
        *current = phase.into();
    }
    /// Share display state while keeping rollback independent of cancellation.
    pub(crate) fn recovery_view(&self) -> Self {
        Self {
            done: self.done.clone(),
            total: self.total.clone(),
            phase: self.phase.clone(),
            ..Self::default()
        }
    }

    pub fn check(&self, token: u64) -> Result<(), String> {
        if self.epoch.load(Ordering::SeqCst) != token {
            Err("Cancelled.".into())
        } else {
            Ok(())
        }
    }
}
pub fn relative(value: &str) -> Result<PathBuf, String> {
    if value.is_empty()
        || value.len() > 700
        || value.split('/').count() > 64
        || value.contains('\\')
        || value.starts_with('/')
        || value.contains(':')
    {
        return Err("Unsafe component path.".into());
    }
    for part in value.split('/') {
        let base = part.split('.').next().unwrap_or("").to_ascii_uppercase();
        if part.is_empty()
            || part == "."
            || part == ".."
            || part.ends_with(['.', ' '])
            || part.chars().any(char::is_control)
            || part.contains(['<', '>', '"', '|', '?', '*'])
            || ["CON", "PRN", "AUX", "NUL"].contains(&base.as_str())
            || (base.len() == 4
                && (base.as_bytes().starts_with(b"COM") || base.as_bytes().starts_with(b"LPT"))
                && base.as_bytes()[3].is_ascii_digit())
        {
            return Err("Unsafe component path segment.".into());
        }
    }
    Ok(PathBuf::from(value))
}
#[cfg(windows)]
fn local_drive_with(path: &Path, query: impl FnOnce(&[u16; 4]) -> u32) -> Result<(), String> {
    use std::path::{Component, Prefix};
    use windows::Win32::System::WindowsProgramming::{
        DRIVE_CDROM, DRIVE_FIXED, DRIVE_RAMDISK, DRIVE_REMOVABLE,
    };
    let refused = "Use a local Windows drive for the component; mapped network, unavailable and device paths are refused.";
    let absolute = std::path::absolute(path).map_err(|_| "Cannot resolve component path.")?;
    let drive = match absolute.components().next() {
        Some(Component::Prefix(p)) => match p.kind() {
            Prefix::Disk(drive) | Prefix::VerbatimDisk(drive) => drive,
            _ => return Err(refused.into()),
        },
        _ => return Err(refused.into()),
    };
    // Explicit terminated root with the required trailing slash; never query a
    // null/default root or assume that a drive letter denotes local storage.
    let root = [drive as u16, b':' as u16, b'\\' as u16, 0];
    match query(&root) {
        DRIVE_REMOVABLE | DRIVE_FIXED | DRIVE_CDROM | DRIVE_RAMDISK => Ok(()),
        _ => Err(refused.into()),
    }
}
pub fn no_links(path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    local_drive_with(path, |root| {
        // Rechecked for each access; no cached drive classification authorizes
        // later filesystem reads, copies or deletion after a mapping changes.
        unsafe {
            windows::Win32::Storage::FileSystem::GetDriveTypeW(windows::core::PCWSTR(root.as_ptr()))
        }
    })?;
    let mut ancestor = Some(path);
    while let Some(p) = ancestor {
        match fs::symlink_metadata(p) {
            Ok(meta) => {
                if meta.file_type().is_symlink() {
                    return Err("Linked component paths are refused.".into());
                }
                #[cfg(windows)]
                {
                    use std::os::windows::fs::MetadataExt;
                    if meta.file_attributes() & 0x400 != 0 {
                        return Err("Reparse component paths are refused.".into());
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err("Cannot inspect component path.".into()),
        }
        ancestor = p.parent();
    }
    Ok(())
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub fn read_manifest(path: &Path, expected: &str) -> Result<Manifest, String> {
    no_links(path)?;
    let metadata =
        fs::metadata(path).map_err(|_| "Choose the optional component's component.json file.")?;
    if !metadata.is_file() || metadata.len() > 16 * 1024 * 1024 {
        return Err("Component manifest exceeds its limit.".into());
    }
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|_| "Cannot read component manifest.")?
        .take(16 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Cannot read component manifest.")?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err("Component manifest exceeds its limit.".into());
    }
    if digest(&bytes) != expected {
        return Err("This component manifest is not the reviewed, pinned AnF runtime. Nothing was installed.".into());
    }
    let m: Manifest = serde_json::from_slice(&bytes).map_err(|_| "Invalid component manifest.")?;
    if m.schema != 1
        || m.platform != "win32-x64"
        || m.version != "3.8.51"
        || m.node_version != "24.19.0"
        || m.node != "node/node.exe"
        || m.entry != "runtime/dist/server-ws.mjs"
        || m.files.is_empty()
        || m.files.len() > 100000
    {
        return Err("Unsupported component identity or file count.".into());
    }
    let mut names = HashSet::new();
    let mut total = 0u64;
    for f in &m.files {
        relative(&f.path)?;
        if !names.insert(f.path.to_ascii_lowercase())
            || f.sha256.len() != 64
            || !f.sha256.bytes().all(|b| b.is_ascii_hexdigit())
            || f.size > 512 * 1024 * 1024
        {
            return Err("Invalid or duplicate component file.".into());
        }
        total = total
            .checked_add(f.size)
            .ok_or("Component size overflow.")?;
    }
    if total > MAX_BYTES || !names.contains(&m.node) || !names.contains(&m.entry) {
        return Err("Component exceeds its limit or lacks its pinned entrypoints.".into());
    }
    Ok(m)
}
fn inspect_tree(
    root: &Path,
    dir: &Path,
    names: &HashSet<String>,
    directories: &HashSet<String>,
    count: &mut usize,
    progress: &Progress,
    token: u64,
) -> Result<(), String> {
    no_links(dir)?;
    for item in fs::read_dir(dir).map_err(|_| "Cannot inspect component inventory.")? {
        let item = item.map_err(|_| "Cannot inspect component file.")?;
        let path = item.path();
        no_links(&path)?;
        let meta = fs::symlink_metadata(&path).map_err(|_| "Cannot inspect component file.")?;
        progress.check(token)?;
        *count += 1;
        if *count > 200000 {
            return Err("Component inventory exceeds its limit.".into());
        }
        let rel = path
            .strip_prefix(root)
            .map_err(|_| "Invalid component root.")?
            .to_string_lossy()
            .replace('\\', "/");
        if meta.is_dir() {
            if !directories.contains(&rel.to_ascii_lowercase()) {
                return Err("Unlisted component directory refused.".into());
            }
            inspect_tree(root, &path, names, directories, count, progress, token)?;
        } else if meta.is_file() {
            if rel != "component.json" && !names.contains(&rel.to_ascii_lowercase()) {
                return Err(
                    "Unlisted component file refused (including private configuration files)."
                        .into(),
                );
            }
        } else {
            return Err("Unsupported component file type.".into());
        }
    }
    Ok(())
}
fn inventory(m: &Manifest) -> (HashSet<String>, HashSet<String>) {
    let files = m
        .files
        .iter()
        .map(|f| f.path.to_ascii_lowercase())
        .collect();
    let mut dirs = HashSet::new();
    for f in &m.files {
        let mut path = Path::new(&f.path).parent();
        while let Some(p) = path {
            if !p.as_os_str().is_empty() {
                dirs.insert(p.to_string_lossy().replace('\\', "/").to_ascii_lowercase());
            }
            path = p.parent();
        }
    }
    (files, dirs)
}
pub fn verify(
    root: &Path,
    expected: &str,
    progress: &Progress,
    token: u64,
) -> Result<Manifest, String> {
    progress.begin("Inspecting component files");
    let m = read_manifest(&root.join("component.json"), expected)?;
    let (names, dirs) = inventory(&m);
    inspect_tree(root, root, &names, &dirs, &mut 0, progress, token)?;
    progress
        .total
        .store(m.files.iter().map(|f| f.size).sum(), Ordering::Relaxed);
    progress.done.store(0, Ordering::Relaxed);
    *progress.phase.lock().unwrap() = "Verifying component files".into();
    // Bound verification just like import: four workers, one 1 MB buffer each.
    // No executable starts until all workers finish every mandatory check.
    let next = AtomicUsize::new(0);
    let failed = AtomicBool::new(false);
    let error = Mutex::new(None::<String>);
    std::thread::scope(|scope| {
        let mut workers = Vec::new();
        for _ in 0..4 {
            let files = &m.files;
            let next = &next;
            let failed = &failed;
            let error = &error;
            workers.push(scope.spawn(move || {
                let mut buf = vec![0u8; 1024 * 1024];
                loop {
                    if failed.load(Ordering::Relaxed) {
                        break;
                    }
                    let Some(item) = files.get(next.fetch_add(1, Ordering::Relaxed)) else {
                        break;
                    };
                    if let Err(message) = verify_one(root, item, progress, token, &mut buf) {
                        let mut first = error.lock().unwrap();
                        if first.is_none() {
                            *first = Some(message);
                        }
                        failed.store(true, Ordering::Relaxed);
                        break;
                    }
                }
            }));
        }
        for worker in workers {
            if worker.join().is_err() {
                let mut first = error.lock().unwrap();
                if first.is_none() {
                    *first = Some("Component verification worker stopped.".into());
                }
                failed.store(true, Ordering::Relaxed);
            }
        }
    });
    if let Some(message) = error
        .into_inner()
        .map_err(|_| "Component verification stopped.")?
    {
        return Err(message);
    }
    progress.check(token)?;
    Ok(m)
}
fn verify_one(
    root: &Path,
    item: &Entry,
    progress: &Progress,
    token: u64,
    buf: &mut [u8],
) -> Result<(), String> {
    progress.check(token)?;
    let path = root.join(relative(&item.path)?);
    no_links(&path)?;
    let mut f = File::open(&path).map_err(|_| "Component file is missing.")?;
    let meta = f.metadata().map_err(|_| "Cannot inspect component file.")?;
    if !meta.is_file() || meta.len() != item.size {
        return Err("Component file size does not match its manifest.".into());
    }
    let mut hash = Sha256::new();
    let mut read_bytes = 0u64;
    loop {
        progress.check(token)?;
        let n = f.read(buf).map_err(|_| "Cannot read component file.")?;
        if n == 0 {
            break;
        }
        read_bytes += n as u64;
        if read_bytes > item.size {
            return Err("Component changed during verification.".into());
        }
        hash.update(&buf[..n]);
        progress.done.fetch_add(n as u64, Ordering::Relaxed);
    }
    if format!("{:x}", hash.finalize()) != item.sha256 {
        return Err("Component file integrity check failed.".into());
    }
    Ok(())
}
fn copy_one(
    source: &Path,
    stage: &Path,
    item: &Entry,
    progress: &Progress,
    token: u64,
    failed: &AtomicBool,
    buf: &mut [u8],
) -> Result<(), String> {
    progress.check(token)?;
    if failed.load(Ordering::Relaxed) {
        return Err("Component import stopped after another file failed.".into());
    }
    let rel = relative(&item.path)?;
    let from = source.join(&rel);
    let to = stage.join(&rel);
    no_links(&from)?;
    no_links(&stage)?;
    let parent = to.parent().ok_or("Invalid component destination.")?;
    no_links(parent)?;
    fs::create_dir_all(parent).map_err(|_| "Cannot stage component directory.")?;
    no_links(parent)?;
    let mut input = File::open(&from).map_err(|_| "Cannot read component file.")?;
    if input
        .metadata()
        .map_err(|_| "Cannot inspect component file.")?
        .len()
        != item.size
    {
        return Err("Component changed during import.".into());
    }
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&to)
        .map_err(|_| "Cannot create staged component file.")?;
    let mut hash = Sha256::new();
    let mut size = 0u64;
    loop {
        progress.check(token)?;
        if failed.load(Ordering::Relaxed) {
            return Err("Component import stopped after another file failed.".into());
        }
        let n = input.read(buf).map_err(|_| "Component read failed.")?;
        if n == 0 {
            break;
        }
        size += n as u64;
        if size > item.size {
            return Err("Component changed during import.".into());
        }
        output
            .write_all(&buf[..n])
            .map_err(|_| "Component write failed.")?;
        hash.update(&buf[..n]);
        progress.done.fetch_add(n as u64, Ordering::Relaxed);
    }
    if size != item.size || format!("{:x}", hash.finalize()) != item.sha256 {
        return Err("Component integrity check failed during import.".into());
    }
    output
        .sync_all()
        .map_err(|_| "Cannot flush component file.")?;
    no_links(&to)?;
    Ok(())
}
pub fn install(
    manifest: &Path,
    home: &Path,
    progress: Arc<Progress>,
    token: u64,
) -> Result<(), String> {
    install_pinned(manifest, home, progress, token, EXPECTED_MANIFEST)
}
pub(crate) fn install_pinned(
    manifest: &Path,
    home: &Path,
    progress: Arc<Progress>,
    token: u64,
    expected: &str,
) -> Result<(), String> {
    progress.check(token)?;
    progress.begin("Inspecting component source");
    // Refuse a repeated import before scanning the source's entire inventory.
    // Keep the second check after private-directory setup to cover races.
    no_links(home)?;
    if home.join("component").exists() {
        return Err("A component is already installed. Stop the gateway before replacing it through a future reviewed update.".into());
    }
    let m = read_manifest(manifest, expected)?;
    let source = manifest.parent().ok_or("Invalid component folder.")?;
    let (names, dirs) = inventory(&m);
    inspect_tree(source, source, &names, &dirs, &mut 0, &progress, token)?;
    no_links(home)?;
    fs::create_dir_all(home).map_err(|_| "Cannot create private component directory.")?;
    crate::managed_process::private_directory(home)?;
    let dest = home.join("component");
    if dest.exists() {
        return Err("A component is already installed. Stop the gateway before replacing it through a future reviewed update.".into());
    }
    let stage = home.join(format!(
        "component-stage-{}",
        crate::local_ai::random_key()?
    ));
    fs::create_dir(&stage).map_err(|_| "Cannot stage component.")?;
    let result = (|| {
        progress
            .total
            .store(m.files.iter().map(|f| f.size).sum(), Ordering::Relaxed);
        progress.done.store(0, Ordering::Relaxed);
        *progress.phase.lock().unwrap() = "Copying and verifying component files".into();
        // Bound disk work and memory: each worker keeps its own 1 MB buffer.
        // All hashes, ancestor/reparse checks and durability flushes remain mandatory.
        let next = AtomicUsize::new(0);
        let failed = AtomicBool::new(false);
        let error = Mutex::new(None::<String>);
        std::thread::scope(|scope| {
            let mut workers = Vec::new();
            for _ in 0..4 {
                let (m, source, stage, progress, next, failed, error) = (
                    &m,
                    source,
                    &stage,
                    progress.as_ref(),
                    &next,
                    &failed,
                    &error,
                );
                workers.push(scope.spawn(move || {
                    let mut buf = vec![0u8; 1024 * 1024];
                    loop {
                        if failed.load(Ordering::Relaxed) {
                            break;
                        }
                        let index = next.fetch_add(1, Ordering::Relaxed);
                        let Some(item) = m.files.get(index) else {
                            break;
                        };
                        if let Err(message) =
                            copy_one(source, stage, item, progress, token, failed, &mut buf)
                        {
                            let mut first = error.lock().unwrap();
                            if first.is_none() {
                                *first = Some(message);
                            }
                            failed.store(true, Ordering::Relaxed);
                            break;
                        }
                    }
                }));
            }
            for worker in workers {
                if worker.join().is_err() {
                    let mut first = error.lock().unwrap();
                    if first.is_none() {
                        *first = Some("Component import worker stopped.".into());
                    }
                    failed.store(true, Ordering::Relaxed);
                }
            }
        });
        if let Some(message) = error
            .into_inner()
            .map_err(|_| "Component import stopped.")?
        {
            return Err(message);
        }
        progress.begin("Saving verified component manifest");
        let mut bytes = Vec::new();
        File::open(manifest)
            .map_err(|_| "Cannot reread manifest.")?
            .take(16 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "Cannot reread manifest.")?;
        if bytes.len() > 16 * 1024 * 1024 {
            return Err("Component manifest changed during import.".into());
        }
        if digest(&bytes) != expected {
            return Err("Component manifest changed during import.".into());
        }
        let mut saved = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(stage.join("component.json"))
            .map_err(|_| "Cannot preserve component manifest.")?;
        saved
            .write_all(&bytes)
            .map_err(|_| "Cannot preserve component manifest.")?;
        saved
            .sync_all()
            .map_err(|_| "Cannot flush component manifest.")?;
        drop(saved);
        progress.check(token)?;
        no_links(home)?;
        no_links(&stage)?;
        fs::rename(&stage, &dest).map_err(|_| "Cannot promote verified component.")?;
        Ok(())
    })();
    if result.is_err() {
        if no_links(&stage).is_ok() && stage.parent() == Some(home) {
            let _ = fs::remove_dir_all(&stage);
        }
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recovery_progress_is_visible_but_cancellation_is_independent() {
        let progress = Progress::default();
        let recovery = progress.recovery_view();
        progress.epoch.store(7, Ordering::SeqCst);
        progress.done.store(10, Ordering::Relaxed);
        progress.total.store(10, Ordering::Relaxed);
        recovery.begin("Cleaning repair rollback data");
        assert_eq!(progress.done.load(Ordering::Relaxed), 0);
        assert_eq!(progress.total.load(Ordering::Relaxed), 0);
        assert_eq!(
            *progress.phase.lock().unwrap(),
            "Cleaning repair rollback data"
        );
        assert!(progress.check(0).is_err());
        assert!(recovery.check(0).is_ok());
        progress.epoch.fetch_add(1, Ordering::SeqCst);
        assert!(recovery.check(0).is_ok());
    }

    #[cfg(windows)]
    #[test]
    fn parallel_import_is_atomic_and_never_overwrites_a_valid_component() {
        let root = std::env::temp_dir().join(format!(
            "anf-component-{}",
            crate::local_ai::random_key().unwrap()
        ));
        fs::create_dir(&root).unwrap();
        let source = root.join("source");
        let home = root.join("private");
        fs::create_dir_all(source.join("node")).unwrap();
        fs::create_dir_all(source.join("runtime/dist")).unwrap();
        let mut entries = Vec::new();
        for path in [
            "node/node.exe",
            "runtime/dist/server-ws.mjs",
            "one.txt",
            "two.txt",
            "three.txt",
        ] {
            fs::write(source.join(path), b"public fixture").unwrap();
            entries.push(Entry {
                path: path.into(),
                size: 14,
                sha256: digest(b"public fixture"),
            });
        }
        let manifest = Manifest {
            schema: 1,
            platform: "win32-x64".into(),
            version: "3.8.51".into(),
            node_version: "24.19.0".into(),
            node: "node/node.exe".into(),
            entry: "runtime/dist/server-ws.mjs".into(),
            files: entries,
        };
        let bytes = serde_json::to_vec(&manifest).unwrap();
        let file = source.join("component.json");
        fs::write(&file, &bytes).unwrap();
        let expected = digest(&bytes);
        // A single corrupt worker must prevent publication of all staged files.
        fs::write(source.join("two.txt"), b"forged fixture").unwrap();
        let p = Arc::new(Progress::default());
        assert!(install_pinned(&file, &home, p.clone(), 0, &expected).is_err());
        assert!(!home.join("component").exists());
        if home.exists() {
            assert_eq!(fs::read_dir(&home).unwrap().count(), 0);
        }
        fs::write(source.join("two.txt"), b"public fixture").unwrap();
        install_pinned(&file, &home, p.clone(), 0, &expected).unwrap();
        assert_eq!(
            fs::read(home.join("component/one.txt")).unwrap(),
            b"public fixture"
        );
        assert!(install_pinned(&file, &home, p.clone(), 0, &expected).is_err());
        assert_eq!(
            fs::read(home.join("component/two.txt")).unwrap(),
            b"public fixture"
        );
        assert_eq!(fs::read_dir(&home).unwrap().count(), 1);
        verify(&home.join("component"), &expected, &p, 0).unwrap();
        fs::write(home.join("component/three.txt"), b"forged fixture").unwrap();
        assert!(verify(&home.join("component"), &expected, &p, 0).is_err());
        fs::write(home.join("component/three.txt"), b"public fixture").unwrap();
        p.epoch.fetch_add(1, Ordering::SeqCst);
        assert!(verify(&home.join("component"), &expected, &p, 0).is_err());
        // Exact freshly-created test root only; no user files are involved.
        assert!(root.starts_with(std::env::temp_dir()));
        no_links(&root).unwrap();
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn rejects_windows_aliases_and_traversal() {
        for bad in [
            "../a",
            "/a",
            "C:/a",
            "a\\b",
            "a:b",
            "a/../b",
            "a/CON.txt",
            "NUL",
            "a/foo.",
            "a/bar ",
            "COM1.txt",
            "a//b",
        ] {
            assert!(relative(bad).is_err(), "{bad}");
        }
        assert!(relative("runtime/dist/server-ws.mjs").is_ok());
    }
    #[test]
    fn cancellation_is_explicit() {
        let p = Progress::default();
        assert!(p.check(0).is_ok());
        p.epoch.fetch_add(1, Ordering::SeqCst);
        assert!(p.check(0).is_err());
    }
    #[cfg(windows)]
    #[test]
    fn network_and_device_paths_are_refused_before_filesystem_access() {
        for path in [
            r"\\127.0.0.1\share\component.json",
            r"\\?\UNC\server\share\component.json",
            r"\\.\PhysicalDrive0",
        ] {
            assert!(no_links(Path::new(path))
                .unwrap_err()
                .contains("local Windows drive"));
        }
    }
    #[cfg(windows)]
    #[test]
    fn mapped_network_drive_aliases_are_rejected() {
        for path in [
            r"Q:\missing\component.json",
            r"\\?\Q:\missing\component.json",
        ] {
            assert!(local_drive_with(Path::new(path), |root| {
                assert_eq!(*root, [b'Q' as u16, b':' as u16, b'\\' as u16, 0]);
                windows::Win32::System::WindowsProgramming::DRIVE_REMOTE
            })
            .unwrap_err()
            .contains("mapped network"));
        }
    }
    #[cfg(windows)]
    #[test]
    fn drive_classification_fails_closed_without_requiring_the_source_to_exist() {
        for kind in [0, 1, 4, u32::MAX] {
            assert!(local_drive_with(Path::new(r"Z:\missing\component.json"), |_| kind).is_err());
        }
        for kind in [2, 3, 5, 6] {
            assert!(local_drive_with(Path::new(r"Z:\missing\component.json"), |_| kind).is_ok());
        }
    }
    #[cfg(windows)]
    #[test]
    #[ignore = "Requires ANF_TEST_REMOTE_DRIVE naming an existing mapped network drive; root-type query only."]
    fn actual_mapped_network_drive_is_refused() {
        let drive = std::env::var("ANF_TEST_REMOTE_DRIVE").unwrap();
        assert!(drive.len() == 1 && drive.as_bytes()[0].is_ascii_alphabetic());
        for path in [
            format!(r"{}:\AnF-readonly-path-probe\component.json", drive),
            format!(r"\\?\{}:\AnF-readonly-path-probe\component.json", drive),
        ] {
            assert!(no_links(Path::new(&path))
                .unwrap_err()
                .contains("mapped network"));
        }
    }
}
