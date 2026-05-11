//! Native binary used by the Anchor TS tests to produce valid Equihash
//! solutions on demand.
//!
//! Reads a JSON request from stdin:
//!   { "n": 96, "k": 5,
//!     "challenge_hex": "..", "miner_hex": "..", "height": 0,
//!     "target_hex": ".." }
//!
//! Writes a JSON response to stdout:
//!   { "nonce_hex": "..", "soln_indices_hex": ".." }
//!
//! Re-tries nonces until either a solution is found or `max_attempts` is hit.

use std::io::{self, Read, Write};

use equihash_core::challenge::build_input;
use equihash_core::solver::solve;
use equihash_core::verify;
use rand::RngCore;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct Request {
    n: u32,
    k: u32,
    challenge_hex: String,
    miner_hex: String,
    height: u64,
    target_hex: String,
    #[serde(default = "default_max_attempts")]
    max_attempts: u64,
}

fn default_max_attempts() -> u64 {
    4096
}

#[derive(Serialize)]
struct Response {
    nonce_hex: String,
    soln_indices_hex: String,
    attempts: u64,
}

fn hex_to_array_32(s: &str) -> [u8; 32] {
    let bytes = hex::decode(s.trim()).expect("hex decode");
    assert_eq!(bytes.len(), 32, "expected 32-byte hex value, got {}", bytes.len());
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    out
}

fn main() {
    let mut buf = String::new();
    io::stdin()
        .read_to_string(&mut buf)
        .expect("read request from stdin");
    let req: Request = serde_json::from_str(&buf).expect("parse JSON request");

    let challenge = hex_to_array_32(&req.challenge_hex);
    let miner = hex_to_array_32(&req.miner_hex);
    let target = hex_to_array_32(&req.target_hex);
    let input = build_input(&challenge, &miner, req.height);

    let mut rng = rand::thread_rng();
    let mut counter: u64 = 0;
    let max = req.max_attempts;

    let solution = solve(req.n, req.k, &input, || {
        counter += 1;
        if counter > max {
            return None;
        }
        let mut nonce = [0u8; 32];
        rng.fill_bytes(&mut nonce);
        Some(nonce)
    })
    .unwrap_or_else(|e| panic!("solver failed: {:?} (after {} attempts)", e, counter));

    // Sanity-verify so we never hand back something `is_valid_solution` would reject.
    verify::verify(
        req.n,
        req.k,
        &input,
        &solution.nonce,
        &solution.soln_indices,
        &target,
    )
    .expect("self-verify failed");

    let resp = Response {
        nonce_hex: hex::encode(solution.nonce),
        soln_indices_hex: hex::encode(&solution.soln_indices),
        attempts: counter,
    };
    let json = serde_json::to_string(&resp).unwrap();
    writeln!(io::stdout(), "{}", json).unwrap();
}
