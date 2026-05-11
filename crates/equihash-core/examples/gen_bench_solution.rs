//! Produces one valid Equihash (96,5) solution bound to a deterministic
//! Equium I-block, sanity-checks it via `equihash::is_valid_solution`, and
//! writes JSON to `scripts/verify-bench/tests/bench-solution.json`.
//!
//! Usage: `cargo run -p equihash-core --features solver --example gen_bench_solution --release`

use std::path::PathBuf;

use equihash_core::challenge::{build_input, I_LEN};
use equihash_core::solver::solve;
use equihash_core::verify;
use equihash_core::{DEFAULT_K, DEFAULT_N};
use rand::RngCore;
use serde::Serialize;

#[derive(Serialize)]
struct BenchSolution {
    n: u32,
    k: u32,
    /// Hex of the Equium I-block (`Equium-v1 || challenge || miner || height_le`).
    input_hex: String,
    nonce_hex: String,
    /// Canonical minimal-byte Equihash encoding.
    soln_indices_hex: String,
    /// All-`0xFF` target so verification always passes the difficulty check —
    /// we only care about CU cost of `is_valid_solution` for the bench.
    target_hex: String,
    /// Convenience for the TS bench so it doesn't need to recompute.
    soln_len: usize,
    input_len: usize,
}

fn main() {
    eprintln!(
        "gen_bench_solution: solving Equihash ({}, {})…",
        DEFAULT_N, DEFAULT_K
    );

    let challenge = [0x42u8; 32];
    let miner = [0x11u8; 32];
    let block_height: u64 = 1;
    let input: [u8; I_LEN] = build_input(&challenge, &miner, block_height);

    let mut rng = rand::thread_rng();
    let mut counter: u64 = 0;
    let max_attempts: u64 = 4096;

    let solution = solve(DEFAULT_N, DEFAULT_K, &input, || {
        counter += 1;
        if counter > max_attempts {
            return None;
        }
        let mut nonce = [0u8; 32];
        rng.fill_bytes(&mut nonce);
        Some(nonce)
    })
    .unwrap_or_else(|e| panic!("solver failed: {:?} (after {} attempts)", e, counter));

    eprintln!(
        "gen_bench_solution: found solution after {} nonce attempts ({} bytes)",
        counter,
        solution.soln_indices.len()
    );

    // Sanity check: the solution must verify under our own verifier.
    let target = [0xFFu8; 32];
    match verify::verify(
        DEFAULT_N,
        DEFAULT_K,
        &input,
        &solution.nonce,
        &solution.soln_indices,
        &target,
    ) {
        Ok(_) => eprintln!("gen_bench_solution: verified OK"),
        Err(e) => panic!("solution failed verification: {:?}", e),
    }

    let bench = BenchSolution {
        n: DEFAULT_N,
        k: DEFAULT_K,
        input_hex: hex::encode(input),
        nonce_hex: hex::encode(solution.nonce),
        soln_indices_hex: hex::encode(&solution.soln_indices),
        target_hex: hex::encode(target),
        soln_len: solution.soln_indices.len(),
        input_len: input.len(),
    };

    let mut out_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    out_path.push("../../scripts/verify-bench/tests/bench-solution.json");
    out_path = out_path.canonicalize().unwrap_or(out_path);

    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent).expect("create parent dir");
    }

    let json = serde_json::to_string_pretty(&bench).unwrap();
    std::fs::write(&out_path, json).expect("write bench-solution.json");
    eprintln!("gen_bench_solution: wrote {}", out_path.display());
}
