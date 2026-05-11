//! Admin-only ix that overrides `cfg.current_target`.
//!
//! Used to seed initial difficulty before a stable miner population arrives
//! (the auto-retarget needs ~5 windows / 300 blocks to converge from a
//! permissive default to a realistic value). Reverts after `admin_renounced`
//! flips true — at that point only the on-chain retarget loop adjusts target.

use anchor_lang::prelude::*;

use crate::errors::EquiumError;
use crate::SetTarget;

pub fn handler(ctx: Context<SetTarget>, new_target: [u8; 32]) -> Result<()> {
    require!(
        !ctx.accounts.config.admin_renounced,
        EquiumError::AdminRenounced
    );
    let prev = ctx.accounts.config.current_target;
    ctx.accounts.config.current_target = new_target;

    emit!(TargetSeeded {
        admin: ctx.accounts.admin.key(),
        prev_target: prev,
        new_target,
    });
    msg!("equium: target updated by admin");
    Ok(())
}

#[event]
pub struct TargetSeeded {
    pub admin: Pubkey,
    pub prev_target: [u8; 32],
    pub new_target: [u8; 32],
}
