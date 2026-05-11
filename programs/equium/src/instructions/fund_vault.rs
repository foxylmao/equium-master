//! One-shot ix: admin transfers exactly `MINEABLE_BASE` (18.9M) from their
//! source ATA into the program-owned mineable vault, flipping `mining_open`
//! to true. Once open, this ix reverts on every subsequent call.
//!
//! The deployer is responsible for any mint authority hygiene (e.g.,
//! revoking it before going public) — the program never touches mint authority.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, TransferChecked};

use crate::errors::EquiumError;
use crate::state::MINEABLE_BASE;
use crate::FundVault;

pub fn handler(ctx: Context<FundVault>) -> Result<()> {
    let clock = Clock::get()?;
    let cfg = &mut ctx.accounts.config;

    require!(!cfg.mining_open, EquiumError::AlreadyOpen);

    // Transfer 18.9M from admin's source → vault. Authority on `source` is
    // checked by SPL Token (must be the admin signer). transfer_checked is
    // the universal API — works for both classic SPL Token and Token-2022.
    let mint_decimals = ctx.accounts.mint.decimals;
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.source.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.mineable_vault.to_account_info(),
                authority: ctx.accounts.admin.to_account_info(),
            },
        ),
        MINEABLE_BASE,
        mint_decimals,
    )?;

    // Re-anchor mining timing to NOW so the empty-round timeout and the
    // first retarget window are measured from when mining actually opens,
    // not from `initialize` (which may have happened arbitrarily earlier).
    cfg.current_round_open_slot = clock.slot;
    cfg.current_round_open_unix_ts = clock.unix_timestamp;
    cfg.last_retarget_unix_ts = clock.unix_timestamp;

    cfg.mining_open = true;

    emit!(MiningOpened {
        admin: ctx.accounts.admin.key(),
        funded_amount: MINEABLE_BASE,
        opened_slot: clock.slot,
        opened_unix_ts: clock.unix_timestamp,
    });

    msg!(
        "equium: vault funded with {} base units; mining_open=true at slot {}",
        MINEABLE_BASE,
        clock.slot
    );
    Ok(())
}

#[event]
pub struct MiningOpened {
    pub admin: Pubkey,
    pub funded_amount: u64,
    pub opened_slot: u64,
    pub opened_unix_ts: i64,
}
