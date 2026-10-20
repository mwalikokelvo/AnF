//! Stopped-only pinned repair. A fixed private transaction directory is the
//! journal; filesystem topology records the swap, an empty marker accepts it.
use crate::managed_component::{self as component, Progress};
use std::{fs, path::Path, sync::Arc};

const TRANSACTION: &str = "component-repair";

fn exists(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}

fn plain_tree(path: &Path) -> Result<(), String> {
    tree_at(path, 0, &mut 0)
}
fn tree_at(path: &Path, depth: usize, count: &mut usize) -> Result<(), String> {
    *count += 1;
    if depth > 80 || *count > 200_000 {
        return Err("Repair directory exceeds inspection limits.".into());
    }
    component::no_links(path)?;
    let meta = fs::symlink_metadata(path).map_err(|_| "Cannot inspect repair data.")?;
    if meta.is_dir() {
        for item in fs::read_dir(path).map_err(|_| "Cannot inspect repair directory.")? {
            tree_at(
                &item.map_err(|_| "Cannot inspect repair entry.")?.path(),
                depth + 1,
                count,
            )?;
        }
    } else if !meta.is_file() {
        return Err("Unexpected repair file type.".into());
    }
    Ok(())
}

fn inspect(home: &Path) -> Result<(), String> {
    component::no_links(home)?;
    let journal = home.join(TRANSACTION);
    component::no_links(&journal)?;
    if !fs::metadata(&journal)
        .map_err(|_| "Cannot inspect repair journal.")?
        .is_dir()
    {
        return Err("Invalid repair journal directory.".into());
    }
    for item in fs::read_dir(&journal).map_err(|_| "Cannot inspect repair journal.")? {
        let item = item.map_err(|_| "Cannot inspect repair journal entry.")?;
        let name = item.file_name();
        let name = name.to_str().ok_or("Invalid repair entry name.")?;
        if !["component", "previous", "accepted"].contains(&name)
            && !name
                .strip_prefix("component-stage-")
                .is_some_and(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return Err("Unexpected repair journal entry; nothing removed.".into());
        }
        plain_tree(&item.path())?;
    }
    let accepted = journal.join("accepted");
    if exists(&accepted)
        && (!accepted.is_dir()
            || fs::read_dir(&accepted)
                .map_err(|_| "Cannot inspect repair marker.")?
                .next()
                .is_some())
    {
        return Err("Invalid repair acceptance marker.".into());
    }
    component::no_links(&home.join("component"))?;
    Ok(())
}

pub fn pending(home: &Path) -> bool {
    exists(&home.join(TRANSACTION))
}

fn remove_owned(path: &Path) -> Result<(), String> {
    plain_tree(path)?;
    if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
    .map_err(|_| "Repair cleanup is pending; retry while stopped.".into())
}

/// Must run under the controller's operation lock while its service is stopped.
/// Before acceptance, always restore the previous directory, even if corrupt.
/// After acceptance, verify the new payload before discarding the rollback.
pub fn recover(home: &Path, expected: &str, progress: &Progress, token: u64) -> Result<(), String> {
    if !pending(home) {
        return Ok(());
    }
    inspect(home)?;
    let journal = home.join(TRANSACTION);
    let dest = home.join("component");
    let candidate = journal.join("component");
    let previous = journal.join("previous");
    if exists(&journal.join("accepted")) {
        component::verify(&dest, expected, progress, token)?;
    } else if exists(&previous) {
        if exists(&dest) {
            if exists(&candidate) {
                return Err("Ambiguous repair state; all copies preserved.".into());
            }
            fs::rename(&dest, &candidate)
                .map_err(|_| "Cannot retain interrupted repair candidate.")?;
        }
        fs::rename(&previous, &dest)
            .map_err(|_| "Cannot restore previous component; repair data preserved.")?;
    } else if !exists(&dest) {
        return Err("Repair has no installed or previous component; data preserved.".into());
    }
    inspect(home)?;
    // Keep acceptance until ALL rollback data is gone. Otherwise an interruption
    // during recursive cleanup could restore a partly deleted previous tree.
    if exists(&journal.join("accepted")) {
        for item in fs::read_dir(&journal).map_err(|_| "Cannot inspect accepted repair.")? {
            let item = item.map_err(|_| "Cannot inspect accepted repair entry.")?;
            if item.file_name() != "accepted" {
                remove_owned(&item.path())?;
            }
        }
        fs::remove_dir(journal.join("accepted"))
            .map_err(|_| "Cannot finish repair acceptance cleanup.")?;
        fs::remove_dir(&journal).map_err(|_| "Cannot finish repair journal cleanup.".into())
    } else {
        remove_owned(&journal)
    }
}

pub fn repair(
    manifest: &Path,
    home: &Path,
    progress: Arc<Progress>,
    token: u64,
) -> Result<(), String> {
    repair_pinned(
        manifest,
        home,
        progress,
        token,
        component::EXPECTED_MANIFEST,
    )
}

fn repair_pinned(
    manifest: &Path,
    home: &Path,
    progress: Arc<Progress>,
    token: u64,
    expected: &str,
) -> Result<(), String> {
    recover(home, expected, &progress, token)?;
    component::no_links(home)?;
    let dest = home.join("component");
    component::no_links(&dest)?;
    if !exists(&dest) {
        return Err("No component to repair. Install the optional component first.".into());
    }
    // Validate the pin before creating transaction state, and refuse selecting
    // our own installed/journal tree as an import source.
    component::read_manifest(manifest, expected)?;
    let source = fs::canonicalize(manifest).map_err(|_| "Cannot resolve repair source.")?;
    let private = fs::canonicalize(home).map_err(|_| "Cannot resolve component directory.")?;
    if source.starts_with(&private) {
        return Err(
            "Choose the separate extracted reviewed component, outside AnF's managed directory."
                .into(),
        );
    }
    let journal = home.join(TRANSACTION);
    fs::create_dir(&journal).map_err(|_| "Cannot create repair journal.")?;
    crate::managed_process::private_directory(&journal)?;
    let result = (|| {
        component::install_pinned(manifest, &journal, progress.clone(), token, expected)?;
        progress.check(token)?;
        inspect(home)?;
        fs::rename(&dest, journal.join("previous"))
            .map_err(|_| "Cannot retain current component; it may be in use.")?;
        fs::rename(journal.join("component"), &dest)
            .map_err(|_| "Cannot promote repair candidate.")?;
        component::verify(&dest, expected, &progress, token)?;
        progress.check(token)?;
        fs::create_dir(journal.join("accepted"))
            .map_err(|_| "Cannot accept repaired component.")?;
        Ok(())
    })();
    // Cancellation must not interrupt rollback. A separate recovery token lets
    // cleanup restore the previous tree even if the import token was cancelled.
    let cleanup = Progress::default();
    let recovered = recover(home, expected, &cleanup, 0);
    match (result, recovered) {
        (_, Err(e)) => Err(e),
        (Err(e), Ok(())) => Err(e),
        (Ok(()), Ok(())) => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::managed_component::{Entry, Manifest};
    use sha2::{Digest, Sha256};
    struct Fixture {
        root: std::path::PathBuf,
        home: std::path::PathBuf,
        source: std::path::PathBuf,
        pin: String,
    }
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "anf-repair-{}",
                crate::local_ai::random_key().unwrap()
            ));
            let home = root.join("private");
            let source = root.join("source");
            fs::create_dir_all(source.join("node")).unwrap();
            fs::create_dir_all(source.join("runtime/dist")).unwrap();
            let files = ["node/node.exe", "runtime/dist/server-ws.mjs"]
                .iter()
                .map(|p| {
                    fs::write(source.join(p), b"reviewed fixture").unwrap();
                    Entry {
                        path: p.to_string(),
                        size: 16,
                        sha256: format!("{:x}", Sha256::digest(b"reviewed fixture")),
                    }
                })
                .collect();
            let manifest = Manifest {
                schema: 1,
                platform: "win32-x64".into(),
                version: "3.8.51".into(),
                node_version: "24.19.0".into(),
                node: "node/node.exe".into(),
                entry: "runtime/dist/server-ws.mjs".into(),
                files,
            };
            let bytes = serde_json::to_vec(&manifest).unwrap();
            let pin = format!("{:x}", Sha256::digest(&bytes));
            let source = source.join("component.json");
            fs::write(&source, bytes).unwrap();
            component::install_pinned(&source, &home, Arc::new(Progress::default()), 0, &pin)
                .unwrap();
            Self {
                root,
                home,
                source,
                pin,
            }
        }
        fn journal(&self) -> std::path::PathBuf {
            self.home.join(TRANSACTION)
        }
        fn stage(&self) {
            fs::create_dir(self.journal()).unwrap();
            component::install_pinned(
                &self.source,
                &self.journal(),
                Arc::new(Progress::default()),
                0,
                &self.pin,
            )
            .unwrap();
        }
        fn old(&self) {
            assert_eq!(
                fs::read(self.home.join("component/old.txt")).unwrap(),
                b"previous marker"
            );
        }
        fn mark_old(&self) {
            fs::write(self.home.join("component/old.txt"), b"previous marker").unwrap();
        }
        fn recover(&self) -> Result<(), String> {
            recover(&self.home, &self.pin, &Progress::default(), 0)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            assert!(self.root.starts_with(std::env::temp_dir()));
            component::no_links(&self.root).unwrap();
            fs::remove_dir_all(&self.root).unwrap();
        }
    }

    #[test]
    fn repairs_corrupt_payload_and_preserves_unrelated_private_data() {
        let f = Fixture::new();
        fs::write(f.home.join("component/node/node.exe"), b"broken").unwrap();
        fs::write(f.home.join("unrelated.txt"), b"preserve").unwrap();
        repair_pinned(&f.source, &f.home, Arc::new(Progress::default()), 0, &f.pin).unwrap();
        component::verify(&f.home.join("component"), &f.pin, &Progress::default(), 0).unwrap();
        assert_eq!(fs::read(f.home.join("unrelated.txt")).unwrap(), b"preserve");
        assert!(!pending(&f.home));
    }
    #[test]
    fn interrupted_topologies_restore_the_previous_copy() {
        for phase in 0..3 {
            let f = Fixture::new();
            f.mark_old();
            f.stage();
            if phase >= 1 {
                fs::rename(f.home.join("component"), f.journal().join("previous")).unwrap();
            }
            if phase >= 2 {
                fs::rename(f.journal().join("component"), f.home.join("component")).unwrap();
            }
            f.recover().unwrap();
            f.old();
            assert!(!pending(&f.home));
            f.recover().unwrap();
        }
    }
    #[test]
    fn accepted_cleanup_never_restores_a_partly_deleted_previous_copy() {
        let f = Fixture::new();
        f.mark_old();
        f.stage();
        fs::rename(f.home.join("component"), f.journal().join("previous")).unwrap();
        fs::rename(f.journal().join("component"), f.home.join("component")).unwrap();
        fs::create_dir(f.journal().join("accepted")).unwrap();
        fs::remove_file(f.journal().join("previous/node/node.exe")).unwrap();
        f.recover().unwrap();
        component::verify(&f.home.join("component"), &f.pin, &Progress::default(), 0).unwrap();
        assert!(!pending(&f.home));
    }
    #[test]
    fn changed_source_or_cancellation_cannot_replace_the_installed_copy() {
        let f = Fixture::new();
        f.mark_old();
        fs::write(f.source.parent().unwrap().join("node/node.exe"), b"forged").unwrap();
        assert!(
            repair_pinned(&f.source, &f.home, Arc::new(Progress::default()), 0, &f.pin).is_err()
        );
        f.old();
        assert!(!pending(&f.home));
        let p = Arc::new(Progress::default());
        p.epoch.store(1, std::sync::atomic::Ordering::SeqCst);
        assert!(repair_pinned(&f.source, &f.home, p, 0, &f.pin).is_err());
        f.old();
    }
    #[test]
    fn malformed_or_ambiguous_journals_preserve_every_copy() {
        let f = Fixture::new();
        f.mark_old();
        f.stage();
        fs::create_dir(f.journal().join("previous")).unwrap();
        assert!(f.recover().is_err());
        f.old();
        assert!(f.journal().join("component").exists());
        fs::write(
            f.journal().join("arbitrary-path"),
            b"never interpret paths from journal entries",
        )
        .unwrap();
        assert!(f.recover().is_err());
        f.old();
    }
    #[test]
    fn refuses_self_source_and_wrong_pin_before_staging() {
        let f = Fixture::new();
        assert!(repair_pinned(
            &f.home.join("component/component.json"),
            &f.home,
            Arc::new(Progress::default()),
            0,
            &f.pin
        )
        .is_err());
        assert!(repair_pinned(
            &f.source,
            &f.home,
            Arc::new(Progress::default()),
            0,
            &"0".repeat(64)
        )
        .is_err());
        assert!(!pending(&f.home));
    }

    #[test]
    fn failed_accepted_verification_preserves_both_copies() {
        let f = Fixture::new();
        f.mark_old();
        f.stage();
        fs::rename(f.home.join("component"), f.journal().join("previous")).unwrap();
        fs::rename(f.journal().join("component"), f.home.join("component")).unwrap();
        fs::create_dir(f.journal().join("accepted")).unwrap();
        fs::write(
            f.home.join("component/node/node.exe"),
            b"damaged after acceptance",
        )
        .unwrap();
        assert!(f.recover().is_err());
        assert_eq!(
            fs::read(f.journal().join("previous/old.txt")).unwrap(),
            b"previous marker"
        );
        assert!(f.journal().join("accepted").exists());
        assert_eq!(
            fs::read(f.home.join("component/node/node.exe")).unwrap(),
            b"damaged after acceptance"
        );
    }

    #[cfg(windows)]
    #[test]
    fn locked_destination_is_not_removed_to_force_repair() {
        use std::os::windows::fs::OpenOptionsExt;
        let f = Fixture::new();
        f.mark_old();
        let locked = fs::OpenOptions::new()
            .read(true)
            .share_mode(1)
            .custom_flags(0x02000000)
            .open(f.home.join("component"))
            .unwrap();
        assert!(
            repair_pinned(&f.source, &f.home, Arc::new(Progress::default()), 0, &f.pin).is_err()
        );
        f.old();
        drop(locked);
        assert!(!pending(&f.home));
    }
}
