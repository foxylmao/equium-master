//! On-chain proof-of-work verification + challenge derivation.
//!
//! All real cryptographic work lives in `equihash-core` — this module is a
//! thin program-side adapter that pulls the SlotHashes sysvar, builds the
//! input block, and surfaces typed errors.

use anchor_lang::prelude::*;
use equihash_core::{challenge, verify};

use crate::errors::EquiumError;

/// Read the most recent slot hash entry from the SlotHashes sysvar account.
///
/// The SlotHashes sysvar layout (per Solana SDK):
///   `[u64 LE: count] || count * (u64 slot LE || [u8; 32] hash)`
///
/// The most recent entry is at the start of the array. We use this as the
/// entropy source for the next round's challenge derivation.
pub fn read_recent_slot_hash(account: &AccountInfo) -> Result<[u8; 32]> {
    let data = account
        .try_borrow_data()
        .map_err(|_| error!(EquiumError::BadSlotHashes))?;

    if data.len() < 8 + 8 + 32 {
        return Err(error!(EquiumError::BadSlotHashes));
    }

    // SlotHashes always has 512 entries on a live cluster, but defending
    // against a zeroed sysvar is cheap.
    let count = u64::from_le_bytes(data[0..8].try_into().unwrap());
    if count == 0 {
        return Err(error!(EquiumError::BadSlotHashes));
    }

    // First entry: bytes 8..16 = slot, bytes 16..48 = hash
    let mut hash = [0u8; 32];
    hash.copy_from_slice(&data[16..48]);
    Ok(hash)
}

/// Verify an Equihash submission against the current round.
pub fn verify_submission(
    n: u32,
    k: u32,
    current_challenge: &[u8; 32],
    miner_pubkey: &[u8; 32],
    block_height: u64,
    nonce: &[u8; 32],
    soln_indices: &[u8],
    target: &[u8; 32],
) -> Result<[u8; 32]> {
    let input = challenge::build_input(current_challenge, miner_pubkey, block_height);
    verify::verify(n, k, &input, nonce, soln_indices, target).map_err(|e| match e {
        verify::VerifyError::InvalidEquihash => error!(EquiumError::InvalidEquihash),
        verify::VerifyError::AboveTarget => error!(EquiumError::AboveTarget),
    })
}
