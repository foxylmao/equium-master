//! Permissionless. Closes a stalled round (≥150 slots since open). No transfer
//! happens — when M2 wires the vault, the unminted reward will simply stay in
//! the vault permanently (effective burn from circulation's perspective).

use anchor_lang::prelude::*;

use crate::errors::EquiumError;
use crate::round::{advance_round, RoundTransition};
use crate::state::ROUND_TIMEOUT_SLOTS;
use crate::AdvanceEmptyRound;

pub fn handler(ctx: Context<AdvanceEmptyRound>) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    let clock = Clock::get()?;

    require!(cfg.mining_open, EquiumError::MiningNotOpen);

    let elapsed = clock
        .slot
        .checked_sub(cfg.current_round_open_slot)
        .ok_or_else(|| error!(EquiumError::RoundStillActive))?;

    require!(
        elapsed >= ROUND_TIMEOUT_SLOTS,
        EquiumError::RoundStillActive
    );

    let prior_height = cfg.block_height;
    advance_round(
        cfg,
        &ctx.accounts.slot_hashes,
        RoundTransition::Empty,
    )?;

    emit!(BlockSkipped {
        height: prior_height,
        elapsed_slots: elapsed,
        new_challenge: cfg.current_challenge,
    });

    msg!(
        "equium: empty-advance from height {} ({} slots elapsed)",
        prior_height,
        elapsed
    );
    Ok(())
}

#[event]
pub struct BlockSkipped {
    pub height: u64,
    pub elapsed_slots: u64,
    pub new_challenge: [u8; 32],
}
