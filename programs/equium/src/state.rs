//! On-chain state.
//!
//! Single global config PDA at seeds `[CONFIG_SEED]`. All round + schedule
//! state lives here; no per-block accounts. Layout chosen with explicit
//! reserved padding for forward compatibility.

use anchor_lang::prelude::*;

/// PDA seed for the global config account.
pub const CONFIG_SEED: &[u8] = b"equium-config";

/// PDA seed for the program-owned vault that custodies the 18.9M mineable
/// supply.
pub const VAULT_SEED: &[u8] = b"equium-vault";

/// 21,000,000 EQM (6 decimals) = 21,000,000,000,000 base units.
pub const TOTAL_SUPPLY_BASE: u64 = 21_000_000 * 1_000_000;

/// 2,100,000 EQM (10%, premine to treasury).
pub const PREMINE_BASE: u64 = 2_100_000 * 1_000_000;

/// 18,900,000 EQM (90%, mineable). Equals `TOTAL_SUPPLY_BASE - PREMINE_BASE`.
pub const MINEABLE_BASE: u64 = TOTAL_SUPPLY_BASE - PREMINE_BASE;

/// 25 EQM initial block reward, in base units.
pub const INITIAL_BLOCK_REWARD_BASE: u64 = 25 * 1_000_000;

/// Halve every 378,000 blocks (~8.6 months at 1-min cadence).
pub const HALVING_INTERVAL_BLOCKS: u64 = 378_000;

/// Difficulty retarget every 60 blocks (~1 hour).
pub const RETARGET_INTERVAL_BLOCKS: u64 = 60;

/// Target time per retarget window in seconds (60 blocks * 60 sec).
pub const RETARGET_TARGET_SECONDS: u64 = RETARGET_INTERVAL_BLOCKS * 60;

/// Damping clamp: ratio is constrained to [1/2, 2/1]. Stored as numerator/denominator
/// pairs for fixed-point math.
pub const RETARGET_MIN_NUM: u64 = 1;
pub const RETARGET_MIN_DEN: u64 = 2;
pub const RETARGET_MAX_NUM: u64 = 2;
pub const RETARGET_MAX_DEN: u64 = 1;

/// A round is considered "stalled" after this many Solana slots without a
/// winner; `advance_empty_round` becomes callable.
pub const ROUND_TIMEOUT_SLOTS: u64 = 150;

/// SPL token decimals.
pub const TOKEN_DECIMALS: u8 = 6;

#[account]
#[derive(InitSpace)]
pub struct EquiumConfig {
    // -- identifiers --
    /// Pre-existing mint the deployer created off-platform. The program only
    /// references it; mint authority management (including revocation) is the
    /// deployer's responsibility, NOT the program's.
    pub mint: Pubkey,
    /// Program-owned token account that custodies the mineable supply. Funded
    /// to exactly `MINEABLE_BASE` via `fund_vault`.
    pub mineable_vault: Pubkey,
    pub mineable_vault_bump: u8,
    pub config_bump: u8,
    pub genesis_slot: u64,
    pub genesis_unix_ts: i64,

    // -- PoW parameters (locked at init by M0 outcome) --
    pub equihash_n: u32,
    pub equihash_k: u32,
    pub current_target: [u8; 32],

    // -- round state --
    pub block_height: u64,
    pub current_challenge: [u8; 32],
    pub current_round_open_slot: u64,
    pub current_round_open_unix_ts: i64,
    pub last_winner: Pubkey,

    // -- schedule state --
    pub current_epoch_reward: u64,
    pub next_halving_block: u64,
    pub next_retarget_block: u64,
    pub last_retarget_unix_ts: i64,

    // -- accounting --
    pub cumulative_mined: u64,
    pub empty_rounds: u64,

    // -- launch state --
    /// Flips true on `fund_vault`. `mine` reverts while false.
    pub mining_open: bool,

    // -- admin --
    pub admin: Pubkey,
    pub admin_renounced: bool,

    // -- forward compat --
    pub _reserved: [u8; 32],
}
