//! Storage identity compatibility. Existing installations are adopted in place:
//! moving a live vault or WebView profile would risk data and credential loss.
use std::path::{Path, PathBuf};
pub fn data_dir(base: &Path, fresh: &str, legacy: &str) -> PathBuf {
    let old = base.join(legacy);
    if old.is_dir() { old } else { base.join(fresh) }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn adopts_existing_profile_without_changing_or_copying_it() {
        let root=std::env::temp_dir().join(format!("anf-identity-{}",std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        assert_eq!(data_dir(&root,"new","old"),root.join("new"));
        std::fs::create_dir_all(root.join("old")).unwrap();
        std::fs::write(root.join("old/settings.json"),b"retained").unwrap();
        std::fs::create_dir_all(root.join("new")).unwrap();
        assert_eq!(data_dir(&root,"new","old"),root.join("old"));
        assert_eq!(std::fs::read(root.join("old/settings.json")).unwrap(),b"retained");
        std::fs::remove_dir_all(root).unwrap();
    }
}
