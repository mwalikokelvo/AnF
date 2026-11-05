use sha2::{Digest, Sha256};

/// Lowercase hex SHA-256. Explicit encoding (not `{:x}`) so output stays
/// byte-identical across sha2 releases. Used for the keyring credential id,
/// sync revision/conflict ids and file/add-on fingerprints; pinned by tests.
pub fn sha256_hex(data: impl AsRef<[u8]>) -> String {
    hex_bytes(Sha256::digest(data.as_ref()))
}

/// Encode already-computed digests without relying on a dependency's LowerHex.
pub fn hex_bytes(data: impl AsRef<[u8]>) -> String {
    use std::fmt::Write;
    let mut out = String::with_capacity(data.as_ref().len() * 2);
    for b in data.as_ref() {
        write!(out, "{b:02x}").expect("write to String");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_leading_zeroes_and_lowercase_for_completed_digests() {
        assert_eq!(hex_bytes([0, 1, 15, 16, 255]), "00010f10ff");
        assert_eq!(hex_bytes([]), "");
    }

    #[test]
    fn matches_known_sha256_vectors() {
        assert_eq!(
            sha256_hex(""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_hex("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            sha256_hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
    }

    #[test]
    fn conflict_id_input_is_pinned() {
        // Same input/golden as crates/anf-vault conflict_id("a", "b").
        assert_eq!(
            sha256_hex("coucou-conflict-v1|a|b"),
            "473df6afd55337db6dc4dfd37a828eda57e11b37040e63df3a4d2f2c47275ff4"
        );
    }
}
