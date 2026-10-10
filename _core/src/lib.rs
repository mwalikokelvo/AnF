mod catalog;
mod document;
mod opds;
mod storage;
mod vault;
pub use catalog::{parse_catalog, CatalogEntry};
pub use document::{DocumentMetadata, DocumentSession};
pub use opds::{parse_opds, OpdsFeed, OpdsLink, OpdsPublication};
pub use storage::{LibraryAnnotation, LibraryBook, LibrarySession, PassageMatch, ReadingPosition};
pub use vault::{document_hash, new_salt, VaultSession};

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum CoreError {
    #[error("Invalid input")]
    InvalidInput,
    #[error("Vault is locked")]
    Locked,
    #[error("Authentication failed")]
    Authentication,
    #[error("Database operation failed")]
    Database,
}
uniffi::setup_scaffolding!();
