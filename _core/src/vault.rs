use crate::CoreError;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use zeroize::Zeroizing;

#[uniffi::export]
pub fn new_salt() -> Vec<u8> {
    let mut salt = vec![0; 16];
    OsRng.fill_bytes(&mut salt);
    salt
}
#[uniffi::export]
pub fn document_hash(data: Vec<u8>) -> String {
    format!("{:x}", Sha256::digest(data))
}
#[derive(uniffi::Object)]
pub struct VaultSession {
    key: Mutex<Option<Zeroizing<[u8; 32]>>>,
}
#[uniffi::export]
impl VaultSession {
    #[uniffi::constructor]
    pub fn new(password: String, salt: Vec<u8>) -> Result<Arc<Self>, CoreError> {
        let password = Zeroizing::new(password);
        if !(8..=4096).contains(&password.len()) || !(16..=64).contains(&salt.len()) {
            return Err(CoreError::InvalidInput);
        }
        let mut key = Zeroizing::new([0; 32]);
        Argon2::default()
            .hash_password_into(password.as_bytes(), &salt, &mut *key)
            .map_err(|_| CoreError::InvalidInput)?;
        Ok(Arc::new(Self {
            key: Mutex::new(Some(key)),
        }))
    }
    pub fn lock(&self) -> Result<(), CoreError> {
        self.key.lock().map_err(|_| CoreError::Locked)?.take();
        Ok(())
    }
    pub fn is_locked(&self) -> bool {
        self.key.lock().map(|key| key.is_none()).unwrap_or(true)
    }
    pub fn encrypt(&self, data: Vec<u8>) -> Result<Vec<u8>, CoreError> {
        let data = Zeroizing::new(data);
        let guard = self.key.lock().map_err(|_| CoreError::Locked)?;
        let key = guard.as_ref().ok_or(CoreError::Locked)?;
        let cipher = Aes256Gcm::new_from_slice(&**key).map_err(|_| CoreError::Authentication)?;
        let mut iv = [0; 12];
        OsRng.fill_bytes(&mut iv);
        let mut result = iv.to_vec();
        result.extend(
            cipher
                .encrypt(Nonce::from_slice(&iv), data.as_slice())
                .map_err(|_| CoreError::Authentication)?,
        );
        Ok(result)
    }
    pub fn decrypt(&self, data: Vec<u8>) -> Result<Vec<u8>, CoreError> {
        if data.len() < 28 {
            return Err(CoreError::InvalidInput);
        }
        let guard = self.key.lock().map_err(|_| CoreError::Locked)?;
        let key = guard.as_ref().ok_or(CoreError::Locked)?;
        Aes256Gcm::new_from_slice(&**key)
            .map_err(|_| CoreError::Authentication)?
            .decrypt(Nonce::from_slice(&data[..12]), &data[12..])
            .map_err(|_| CoreError::Authentication)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn round_trip_tamper_and_lock() {
        let vault = VaultSession::new("test-password".into(), new_salt()).unwrap();
        let clear = b"Private annotations".to_vec();
        let mut encrypted = vault.encrypt(clear.clone()).unwrap();
        assert!(!encrypted.windows(clear.len()).any(|part| part == clear));
        assert_eq!(vault.decrypt(encrypted.clone()).unwrap(), clear);
        encrypted[12] ^= 1;
        assert!(vault.decrypt(encrypted).is_err());
        vault.lock().unwrap();
        assert!(vault.encrypt(clear).is_err());
    }
    #[test]
    fn wrong_password_is_rejected() {
        let salt = new_salt();
        let a = VaultSession::new("test-password".into(), salt.clone()).unwrap();
        let b = VaultSession::new("other-password".into(), salt).unwrap();
        assert!(b.decrypt(a.encrypt(vec![1, 2, 3]).unwrap()).is_err());
    }
}
