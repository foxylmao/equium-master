//! Sets up the Equium config PDA + creates an empty mineable vault PDA.
//!
//! Mining stays closed (`mining_open = false`) until `fund_vault` deposits the
//! 18.9M mineable supply. The mint itself is pre-existing — the deployer
//! creates it (and handles mint authority revocation) off-platform.

use anchor_lang::prelude::*;
use sha2::{Digest, Sha256};

use crate::state::{
    HALVING_INTERVAL_BLOCKS, INITIAL_BLOCK_REWARD_BASE, RETARGET_INTERVAL_BLOCKS,
};
use crate::{Initialize, InitializeArgs};

pub fn handler(ctx: Context<Initialize>, args: InitializeArgs) -> Result<()> {
    let clock = Clock::get()?;
    let cfg = &mut ctx.accounts.config;
    let config_bump = ctx.bumps.config;
    let vault_bump = ctx.bumps.mineable_vault;

    let mint_key = ctx.accounts.mint.key();
    let vault_key = ctx.accounts.mineable_vault.key();

    // Genesis challenge bootstrap. We bind to the (existing) mint pubkey +
    // genesis slot — both are public-known + deterministic.
    let mut hasher = Sha256::new();
    hasher.update(mint_key.as_ref());
    hasher.update(clock.slot.to_le_bytes());
    let genesis_challenge: [u8; 32] = hasher.finalize().into();

    cfg.mint = mint_key;
    cfg.mineable_vault = vault_key;
    cfg.mineable_vault_bump = vault_bump;
    cfg.config_bump = config_bump;
    cfg.genesis_slot = clock.slot;
    cfg.genesis_unix_ts = clock.unix_timestamp;

    cfg.equihash_n = args.equihash_n;
    cfg.equihash_k = args.equihash_k;
    cfg.current_target = args.initial_target;

    cfg.block_height = 0;
    cfg.current_challenge = genesis_challenge;
    // Round timing is overwritten at `fund_vault` so empty-round timeouts
    // and the first retarget window are measured from when mining actually
    // opens, not from initialize.
    cfg.current_round_open_slot = clock.slot;
    cfg.current_round_open_unix_ts = clock.unix_timestamp;
    cfg.last_winner = Pubkey::default();

    cfg.current_epoch_reward = INITIAL_BLOCK_REWARD_BASE;
    cfg.next_halving_block = HALVING_INTERVAL_BLOCKS;
    cfg.next_retarget_block = RETARGET_INTERVAL_BLOCKS;
    cfg.last_retarget_unix_ts = clock.unix_timestamp;

    cfg.cumulative_mined = 0;
    cfg.empty_rounds = 0;

    cfg.mining_open = false;

    cfg.admin = ctx.accounts.admin.key();
    cfg.admin_renounced = false;
    cfg._reserved = [0u8; 32];

    emit!(EquiumInitialized {
        admin: cfg.admin,
        config: cfg.key(),
        mint: mint_key,
        mineable_vault: vault_key,
        equihash_n: cfg.equihash_n,
        equihash_k: cfg.equihash_k,
        genesis_slot: cfg.genesis_slot,
        genesis_unix_ts: cfg.genesis_unix_ts,
        initial_target: cfg.current_target,
        genesis_challenge: cfg.current_challenge,
    });

    msg!(
        "equium: initialized at slot {} (mint {}, vault {}); mining_open=false",
        cfg.genesis_slot,
        mint_key,
        vault_key
    );
    Ok(())
}

#[event]
pub struct EquiumInitialized {
    pub admin: Pubkey,
    pub config: Pubkey,
    pub mint: Pubkey,
    pub mineable_vault: Pubkey,
    pub equihash_n: u32,
    pub equihash_k: u32,
    pub genesis_slot: u64,
    pub genesis_unix_ts: i64,
    pub initial_target: [u8; 32],
    pub genesis_challenge: [u8; 32],
}
