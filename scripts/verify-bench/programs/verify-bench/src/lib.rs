//! M0 GO/NO-GO benchmark.
//!
//! Single instruction `verify` that calls `equihash_core::verify::verify` with
//! caller-supplied Equihash params + solution. Logs CU before and after via
//! `sol_log_compute_units` so the off-chain bench script can extract the
//! verification cost from the tx logs.
//!
//! Decision tree (see plan §M0 GO/NO-GO Benchmark):
//!   ≤ 1.1M CU at (144,5)  → lock (144,5)
//!   1.1M–1.3M             → re-bench at (96,5); lock if it fits
//!   > 1.3M at both        → pivot to DrillX/Equix

use anchor_lang::prelude::*;
use anchor_lang::solana_program::log::sol_log_compute_units;
use equihash_core::verify;

declare_id!("DzQJoAyCccgihKoQTJ78cmo5CxZCE5Nn4cNP6RQuGM3K");

#[program]
pub mod verify_bench {
    use super::*;

    pub fn verify(
        _ctx: Context<VerifyCtx>,
        n: u32,
        k: u32,
        input: [u8; equihash_core::challenge::I_LEN],
        nonce: [u8; 32],
        soln_indices: Vec<u8>,
        target: [u8; 32],
    ) -> Result<()> {
        msg!("verify-bench: equihash params n={} k={}", n, k);
        msg!("verify-bench: soln_indices len = {}", soln_indices.len());

        sol_log_compute_units();
        let result = verify::verify(n, k, &input, &nonce, &soln_indices, &target);
        sol_log_compute_units();

        match result {
            Ok(_) => msg!("verify-bench: ACCEPTED"),
            Err(verify::VerifyError::InvalidEquihash) => {
                msg!("verify-bench: REJECTED — invalid equihash")
            }
            Err(verify::VerifyError::AboveTarget) => {
                msg!("verify-bench: REJECTED — above target")
            }
        }

        // We don't fail the tx on rejection — the goal is to read CU from logs
        // regardless of accept/reject outcome.
        Ok(())
    }
}

#[derive(Accounts)]
pub struct VerifyCtx<'info> {
    pub payer: Signer<'info>,
}
