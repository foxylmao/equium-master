//! Encrypted on-disk keystore. The user's secret key is encrypted with a
//! password-derived key (Argon2id) and stored as JSON at
//! `<app_data>/wallet.json`. The plaintext only lives in memory between
//! unlock and lock.

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::Aes256Gcm;
use anyhow::{anyhow, Context, Result};
use argon2::{Algorithm, Argon2, Params, Version};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use solana_sdk::signature::{Keypair, SeedDerivable, Signer};
use std::path::Path;
use std::sync::Arc;
use tauri::State;

use crate::AppState;

#[derive(Serialize, Deserialize, Clone)]
pub struct EncryptedKeystore {
    pub version: u32,
    pub pubkey: String,
    /// Base64 Argon2 salt (16 bytes).
    pub salt_b64: String,
    /// Base64 AES-GCM nonce (12 bytes).
    pub nonce_b64: String,
    /// Base64 ciphertext of the 32-byte seed.
    pub ciphertext_b64: String,
    pub created_at_unix_ms: i64,
}

fn b64encode(bytes: &[u8]) -> String {
    use base64_inline::encode;
    encode(bytes)
}

fn b64decode(s: &str) -> Result<Vec<u8>> {
    use base64_inline::decode;
    decode(s).map_err(|e| anyhow!("base64 decode: {e}"))
}

/// Tiny base64 impl so we don't pull in an extra crate.
mod base64_inline {
    const CHARSET: &[u8] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    pub fn encode(bytes: &[u8]) -> String {
        let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
        for chunk in bytes.chunks(3) {
            let b0 = chunk[0];
            let b1 = chunk.get(1).copied().unwrap_or(0);
            let b2 = chunk.get(2).copied().unwrap_or(0);
            out.push(CHARSET[(b0 >> 2) as usize] as char);
            out.push(CHARSET[(((b0 & 0b11) << 4) | (b1 >> 4)) as usize] as char);
            if chunk.len() > 1 {
                out.push(CHARSET[(((b1 & 0b1111) << 2) | (b2 >> 6)) as usize] as char);
            } else {
                out.push('=');
            }
            if chunk.len() > 2 {
                out.push(CHARSET[(b2 & 0b111111) as usize] as char);
            } else {
                out.push('=');
            }
        }
        out
    }

    pub fn decode(s: &str) -> Result<Vec<u8>, String> {
        let mut buf = [0u8; 4];
        let mut out = Vec::with_capacity(s.len() / 4 * 3);
        let mut i = 0;
        for c in s.chars().filter(|c| !c.is_whitespace()) {
            let v = if c == '=' {
                255
            } else if let Some(pos) = CHARSET.iter().position(|&b| b == c as u8) {
                pos as u8
            } else {
                return Err(format!("invalid char: {c}"));
            };
            buf[i] = v;
            i += 1;
            if i == 4 {
                let b0 = (buf[0] << 2) | (buf[1] >> 4);
                out.push(b0);
                if buf[2] != 255 {
                    out.push((buf[1] << 4) | (buf[2] >> 2));
                }
                if buf[3] != 255 {
                    out.push((buf[2] << 6) | buf[3]);
                }
                i = 0;
            }
        }
        Ok(out)
    }
}

fn derive_aes_key(password: &str, salt: &[u8]) -> Result<[u8; 32]> {
    let params = Params::new(64 * 1024, 4, 1, Some(32))
        .map_err(|e| anyhow!("argon2 params: {e:?}"))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut out = [0u8; 32];
    argon
        .hash_password_into(password.as_bytes(), salt, &mut out)
        .map_err(|e| anyhow!("argon2 hash: {e:?}"))?;
    Ok(out)
}

fn encrypt_keypair(kp: &Keypair, password: &str) -> Result<EncryptedKeystore> {
    if password.len() < 8 {
        return Err(anyhow!("password must be at least 8 characters"));
    }
    let mut salt = [0u8; 16];
    rand::Rng::fill(&mut rand::thread_rng(), &mut salt);
    let key_bytes = derive_aes_key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| anyhow!("aes init: {e}"))?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let seed = &kp.to_bytes()[..32];
    let ciphertext = cipher
        .encrypt(&nonce, seed)
        .map_err(|e| anyhow!("aes encrypt: {e}"))?;
    Ok(EncryptedKeystore {
        version: 1,
        pubkey: kp.pubkey().to_string(),
        salt_b64: b64encode(&salt),
        nonce_b64: b64encode(nonce.as_slice()),
        ciphertext_b64: b64encode(&ciphertext),
        created_at_unix_ms: chrono_unix_ms(),
    })
}

fn decrypt_keystore(store: &EncryptedKeystore, password: &str) -> Result<Keypair> {
    let salt = b64decode(&store.salt_b64).context("salt decode")?;
    let nonce = b64decode(&store.nonce_b64).context("nonce decode")?;
    let ct = b64decode(&store.ciphertext_b64).context("ct decode")?;
    if nonce.len() != 12 {
        return Err(anyhow!("nonce must be 12 bytes"));
    }
    let key_bytes = derive_aes_key(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| anyhow!("aes init: {e}"))?;
    let seed = cipher
        .decrypt(aes_gcm::Nonce::from_slice(&nonce), ct.as_slice())
        .map_err(|_| anyhow!("wrong password"))?;
    if seed.len() != 32 {
        return Err(anyhow!("corrupt ciphertext"));
    }
    let mut seed_arr = [0u8; 32];
    seed_arr.copy_from_slice(&seed);
    let kp =
        Keypair::from_seed(&seed_arr).map_err(|e| anyhow!("keypair from seed: {e:?}"))?;
    if kp.pubkey().to_string() != store.pubkey {
        return Err(anyhow!("decrypted seed doesn't match stored pubkey"));
    }
    Ok(kp)
}

fn keypair_from_user_input(s: &str) -> Result<Keypair> {
    let s = s.trim();
    if s.starts_with('[') {
        let arr: Vec<u8> = serde_json::from_str(s).context("invalid JSON keypair")?;
        if arr.len() != 64 {
            return Err(anyhow!("expected 64-byte secret-key array"));
        }
        return Keypair::from_bytes(&arr).map_err(|e| anyhow!("keypair from bytes: {e}"));
    }
    let decoded = bs58::decode(s).into_vec().map_err(|e| anyhow!("invalid base58: {e}"))?;
    match decoded.len() {
        64 => Keypair::from_bytes(&decoded).map_err(|e| anyhow!("keypair from bytes: {e}")),
        32 => {
            let mut seed = [0u8; 32];
            seed.copy_from_slice(&decoded);
            Keypair::from_seed(&seed).map_err(|e| anyhow!("keypair from seed: {e}"))
        }
        n => Err(anyhow!("expected 32 or 64 bytes, got {n}")),
    }
}

fn load_store(path: &Path) -> Option<EncryptedKeystore> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn save_store(path: &Path, store: &EncryptedKeystore) -> Result<()> {
    let s = serde_json::to_string_pretty(store)?;
    std::fs::write(path, s)?;
    Ok(())
}

fn chrono_unix_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ============================================================================
// Tauri commands
// ============================================================================

#[derive(Serialize)]
pub struct WalletStatus {
    pub status: &'static str, // "needs-setup" | "needs-unlock" | "unlocked"
    pub pubkey: Option<String>,
}

// Tauri's `State<'r, T>` is borrowed from the request scope; the macro will
// fail to compile if we lock the lifetime to `'static`.
type SharedState<'a> = State<'a, Arc<Mutex<AppState>>>;

#[tauri::command]
pub fn wallet_status(state: SharedState<'_>) -> WalletStatus {
    let g = state.lock();
    if g.unlocked.is_some() {
        return WalletStatus {
            status: "unlocked",
            pubkey: g.unlocked.as_ref().map(|k| k.pubkey().to_string()),
        };
    }
    if let Some(store) = load_store(&g.keystore_path()) {
        return WalletStatus {
            status: "needs-unlock",
            pubkey: Some(store.pubkey),
        };
    }
    WalletStatus {
        status: "needs-setup",
        pubkey: None,
    }
}

#[tauri::command]
pub fn create_wallet(
    state: SharedState<'_>,
    password: String,
) -> Result<WalletStatus, String> {
    let kp = Keypair::new();
    let store = encrypt_keypair(&kp, &password).map_err(|e| e.to_string())?;
    {
        let g = state.lock();
        save_store(&g.keystore_path(), &store).map_err(|e| e.to_string())?;
    }
    let pubkey = kp.pubkey().to_string();
    state.lock().unlocked = Some(kp);
    Ok(WalletStatus {
        status: "unlocked",
        pubkey: Some(pubkey),
    })
}

#[tauri::command]
pub fn import_wallet(
    state: SharedState<'_>,
    secret: String,
    password: String,
) -> Result<WalletStatus, String> {
    let kp = keypair_from_user_input(&secret).map_err(|e| e.to_string())?;
    let store = encrypt_keypair(&kp, &password).map_err(|e| e.to_string())?;
    {
        let g = state.lock();
        save_store(&g.keystore_path(), &store).map_err(|e| e.to_string())?;
    }
    let pubkey = kp.pubkey().to_string();
    state.lock().unlocked = Some(kp);
    Ok(WalletStatus {
        status: "unlocked",
        pubkey: Some(pubkey),
    })
}

#[tauri::command]
pub fn unlock_wallet(
    state: SharedState<'_>,
    password: String,
) -> Result<WalletStatus, String> {
    let store = {
        let g = state.lock();
        load_store(&g.keystore_path())
            .ok_or_else(|| "no wallet on disk".to_string())?
    };
    let kp = decrypt_keystore(&store, &password).map_err(|e| e.to_string())?;
    let pubkey = kp.pubkey().to_string();
    state.lock().unlocked = Some(kp);
    Ok(WalletStatus {
        status: "unlocked",
        pubkey: Some(pubkey),
    })
}

#[tauri::command]
pub fn lock_wallet(state: SharedState<'_>) -> WalletStatus {
    let mut g = state.lock();
    g.unlocked = None;
    if let Some(store) = load_store(&g.keystore_path()) {
        WalletStatus {
            status: "needs-unlock",
            pubkey: Some(store.pubkey),
        }
    } else {
        WalletStatus {
            status: "needs-setup",
            pubkey: None,
        }
    }
}

#[tauri::command]
pub fn forget_wallet(state: SharedState<'_>) -> WalletStatus {
    let g = state.lock();
    let _ = std::fs::remove_file(g.keystore_path());
    drop(g);
    state.lock().unlocked = None;
    WalletStatus {
        status: "needs-setup",
        pubkey: None,
    }
}

#[tauri::command]
pub fn export_secret(state: SharedState<'_>) -> Result<String, String> {
    let g = state.lock();
    match &g.unlocked {
        Some(kp) => Ok(bs58::encode(kp.to_bytes()).into_string()),
        None => Err("wallet is locked".into()),
    }
}
