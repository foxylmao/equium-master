use anchor_lang::prelude::*;

#[error_code]
pub enum EquiumError {
    #[msg("admin authority has been renounced")]
    AdminRenounced,
    #[msg("caller is not the admin")]
    NotAdmin,
    #[msg("equihash solution failed verification")]
    InvalidEquihash,
    #[msg("solution hash does not fall under the difficulty target")]
    AboveTarget,
    #[msg("submitted challenge does not match the current round")]
    StaleChallenge,
    #[msg("round is still active and not eligible for empty advance")]
    RoundStillActive,
    #[msg("mineable supply has been exhausted")]
    SupplyExhausted,
    #[msg("invalid Equihash parameters")]
    InvalidEquihashParams,
    #[msg("slot hashes sysvar account is missing or malformed")]
    BadSlotHashes,
    #[msg("integer overflow in schedule computation")]
    ScheduleOverflow,
    #[msg("epoch reward has reached zero — no further rewards mintable")]
    RewardZeroed,
    #[msg("mint account does not match the one stored in config")]
    WrongMint,
    #[msg("mineable vault account does not match the one stored in config")]
    WrongVault,
    #[msg("mining has not yet been opened — call fund_vault first")]
    MiningNotOpen,
    #[msg("mining is already open; fund_vault can only be called once")]
    AlreadyOpen,
    #[msg("source token account is not for the configured mint")]
    SourceMintMismatch,
}
