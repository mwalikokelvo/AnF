//! Thin bridge to the shared AnF vault domain crate.
//! Host storage (SQLCipher) stays in `vault.rs`. Not ThingsBook / `_core`.
use anf_vault::{ops, SCHEMA_SQL, SCHEMA_VERSION, MAX_VERSIONS_PER_PROJECT};

pub fn schema_version() -> &'static str {
    SCHEMA_VERSION
}

pub fn schema_sql() -> &'static str {
    SCHEMA_SQL
}

pub fn max_versions() -> usize {
    MAX_VERSIONS_PER_PROJECT
}

/// Operation names expected by the Android/Web bridge (vault-bridge-v1).
pub mod bridge_ops {
    pub use anf_vault::ops::*;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn schema_matches_contract() {
        assert_eq!(schema_version(), "1");
        assert!(schema_sql().contains("CREATE TABLE IF NOT EXISTS projects"));
        assert_eq!(max_versions(), 20);
        assert_eq!(ops::STATUS, "status");
        assert_eq!(ops::PUT, "put");
    }
}
