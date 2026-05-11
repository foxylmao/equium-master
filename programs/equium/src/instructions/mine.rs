//! M2: verifies Equihash + threshold + miner-pubkey binding, transfers the
//! current epoch reward from the program-owned vault to the miner's ATA, and
//! advances the round (which applies halving + retarget at boundaries).
//!
//! Supply cap is enforced at two layers: (a) SPL — mint authority was revoked
//! at `initialize` so the 21M cap is structural; (b) program — we still gate
//! `cumulative_mined + reward ≤ MINEABLE_BASE` to prevent draining the vault
//! past its initial 18.9M (an empty-round window can't burn supply but it
//! also can't lift the cap).

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, TransferChecked};

use crate::errors::EquiumError;
use crate::pow::verify_submission;
use crate::round::{advance_round, RoundTransition};
use crate::state::{CONFIG_SEED, MINEABLE_BASE};
use crate::Mine;

pub fn handler(
    ctx: Context<Mine>,
    nonce: [u8; 32],
    soln_indices: Vec<u8>,
) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    let miner = ctx.accounts.miner.key();

    require!(cfg.mining_open, EquiumError::MiningNotOpen);

    // Equihash + difficulty + miner-binding all checked here. Binding is
    // implicit: the I-block embeds `miner_pubkey`, so a copyist's submission
    // cannot pass — they'd have to re-solve under their own pubkey.
    let solution_hash = verify_submission(
        cfg.equihash_n,
        cfg.equihash_k,
        &cfg.current_challenge,
        &miner.to_bytes(),
        cfg.block_height,
        &nonce,
        &soln_indices,
        &cfg.current_target,
    )?;

    // Snapshot the reward at the *current* epoch — halving (if this block is
    // a halving boundary) takes effect for the *next* round, not this one.
    let reward = cfg.current_epoch_reward;
    require!(reward > 0, EquiumError::RewardZeroed);

    let new_cumulative = cfg
        .cumulative_mined
        .checked_add(reward)
        .ok_or_else(|| error!(EquiumError::ScheduleOverflow))?;
    require!(new_cumulative <= MINEABLE_BASE, EquiumError::SupplyExhausted);

    // CPI: vault → miner_ata, signed by config PDA. transfer_checked is the
    // universal API — works for both classic SPL Token and Token-2022.
    let config_bump = cfg.config_bump;
    let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[config_bump]]];
    let mint_decimals = ctx.accounts.mint.decimals;
    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.mineable_vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.miner_ata.to_account_info(),
                authority: cfg.to_account_info(),
            },
            signer_seeds,
        ),
        reward,
        mint_decimals,
    )?;

    cfg.cumulative_mined = new_cumulative;

    let new_height = advance_round(
        cfg,
        &ctx.accounts.slot_hashes,
        RoundTransition::Mined { winner: miner },
    )?;

    emit!(BlockMined {
        height: new_height - 1,
        winner: miner,
        reward,
        solution_hash,
        new_challenge: cfg.current_challenge,
    });

    msg!(
        "equium: mined block {} by {} for {} base units",
        new_height - 1,
        miner,
        reward
    );
    Ok(())
}

#[event]
pub struct BlockMined {
    pub height: u64,
    pub winner: Pubkey,
    pub reward: u64,
    /// SHA256(soln_indices || I-block) — used by indexers as a tx-stable
    /// block identifier across reorgs.
    pub solution_hash: [u8; 32],
    /// The challenge that opens the *next* round.
    pub new_challenge: [u8; 32],
}
