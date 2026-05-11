//! Round-transition helper shared between `mine` and `advance_empty_round`.
//!
//! M1 scope: increment block height, derive next challenge, update round
//! open slot/ts. Halving + retarget at boundaries are deferred to M2 — the
//! boundary detection lives in `schedule.rs` and will be plugged in here.

use anchor_lang::prelude::*;
use equihash_core::challenge::derive_next_challenge;

use crate::errors::EquiumError;
use crate::pow::read_recent_slot_hash;
use crate::schedule::{is_halving_boundary, is_retarget_boundary, next_target};
use crate::state::{
    EquiumConfig, HALVING_INTERVAL_BLOCKS, RETARGET_INTERVAL_BLOCKS,
};

/// Outcome of a round transition. `Mined` carries the winner; `Empty` is the
/// timeout-advanced path (no winner, reward stays in the vault when M2 wires
/// the transfer).
pub enum RoundTransition {
    Mined { winner: Pubkey },
    Empty,
}

/// Advance the global config to the next round.
///
/// Reads:
///   - `Clock` sysvar for the new round's open slot/ts
///   - `slot_hashes` AccountInfo for entropy that mixes into the next challenge
///
/// Returns the post-advance block height for caller logging / events.
pub fn advance_round(
    cfg: &mut EquiumConfig,
    slot_hashes: &AccountInfo,
    transition: RoundTransition,
) -> Result<u64> {
    let clock = Clock::get()?;
    let entropy = read_recent_slot_hash(slot_hashes)?;

    let winner_pubkey: [u8; 32] = match transition {
        RoundTransition::Mined { winner } => winner.to_bytes(),
        RoundTransition::Empty => [0u8; 32],
    };

    let new_height = cfg
        .block_height
        .checked_add(1)
        .ok_or_else(|| error!(EquiumError::ScheduleOverflow))?;

    let new_challenge =
        derive_next_challenge(&cfg.current_challenge, &winner_pubkey, &entropy);

    cfg.block_height = new_height;
    cfg.current_challenge = new_challenge;
    cfg.current_round_open_slot = clock.slot;
    cfg.current_round_open_unix_ts = clock.unix_timestamp;

    match transition {
        RoundTransition::Mined { winner } => {
            cfg.last_winner = winner;
        }
        RoundTransition::Empty => {
            cfg.empty_rounds = cfg
                .empty_rounds
                .checked_add(1)
                .ok_or_else(|| error!(EquiumError::ScheduleOverflow))?;
            // Don't clobber `last_winner`; it stays pointing at the most
            // recent actual winner. Indexers can compare against `block_height`
            // to know it's stale.
        }
    }

    if is_retarget_boundary(new_height) {
        let actual_seconds = clock
            .unix_timestamp
            .saturating_sub(cfg.last_retarget_unix_ts)
            .max(0) as u64;
        cfg.current_target = next_target(&cfg.current_target, actual_seconds);
        cfg.last_retarget_unix_ts = clock.unix_timestamp;
        cfg.next_retarget_block = new_height
            .checked_add(RETARGET_INTERVAL_BLOCKS)
            .ok_or_else(|| error!(EquiumError::ScheduleOverflow))?;

        emit!(DifficultyRetargeted {
            height: new_height,
            actual_seconds,
            new_target: cfg.current_target,
        });
    }

    if is_halving_boundary(new_height) {
        cfg.current_epoch_reward >>= 1;
        cfg.next_halving_block = new_height
            .checked_add(HALVING_INTERVAL_BLOCKS)
            .ok_or_else(|| error!(EquiumError::ScheduleOverflow))?;

        emit!(RewardHalved {
            height: new_height,
            new_reward: cfg.current_epoch_reward,
        });
    }

    Ok(new_height)
}

#[event]
pub struct DifficultyRetargeted {
    pub height: u64,
    pub actual_seconds: u64,
    pub new_target: [u8; 32],
}

#[event]
pub struct RewardHalved {
    pub height: u64,
    pub new_reward: u64,
}
