//! Halving + difficulty retarget logic. Pure functions over the config struct
//! state — no account access here, callers pass in the relevant fields.

use equihash_core::target::scale_target;

use crate::state::{
    HALVING_INTERVAL_BLOCKS, INITIAL_BLOCK_REWARD_BASE, RETARGET_INTERVAL_BLOCKS,
    RETARGET_MAX_DEN, RETARGET_MAX_NUM, RETARGET_MIN_DEN, RETARGET_MIN_NUM,
    RETARGET_TARGET_SECONDS,
};

/// Compute the block reward at a given block height, given the schedule. After
/// ~30 halvings the reward becomes 0 (we'll long since have minted ~99.999...% of
/// the mineable supply).
pub fn reward_at_height(height: u64) -> u64 {
    let halvings = height / HALVING_INTERVAL_BLOCKS;
    if halvings >= 64 {
        return 0;
    }
    INITIAL_BLOCK_REWARD_BASE >> halvings
}

/// Should this block trigger a halving? (Boundary semantic: yes when `height`
/// is a positive multiple of `HALVING_INTERVAL_BLOCKS`.)
pub fn is_halving_boundary(height: u64) -> bool {
    height > 0 && height % HALVING_INTERVAL_BLOCKS == 0
}

/// Should this block trigger a retarget?
pub fn is_retarget_boundary(height: u64) -> bool {
    height > 0 && height % RETARGET_INTERVAL_BLOCKS == 0
}

/// Compute the new difficulty target from the prior window's actual elapsed
/// seconds. Damping clamp: ratio ∈ [1/2, 2].
///
/// Returns the new 256-bit target. Higher = easier.
pub fn next_target(old_target: &[u8; 32], actual_seconds: u64) -> [u8; 32] {
    let expected = RETARGET_TARGET_SECONDS;

    // Pathological: zero elapsed (clock skew / instant window). Maximally
    // harden — clamp to MIN ratio = 0.5x.
    if actual_seconds == 0 {
        return scale_target(old_target, RETARGET_MIN_NUM, RETARGET_MIN_DEN);
    }

    // BTC convention: new = old * (actual / expected), clamped to [MIN, MAX].
    //   actual > expected → blocks slow → target up → easier
    //   actual < expected → blocks fast → target down → harder
    //
    // Clamp comparisons (cross-multiplied, no division):
    //   ratio < MIN  ⇔  actual * MIN_DEN < expected * MIN_NUM
    //   ratio > MAX  ⇔  actual * MAX_DEN > expected * MAX_NUM
    let actual_x_min_den = actual_seconds.saturating_mul(RETARGET_MIN_DEN);
    let expected_x_min_num = expected.saturating_mul(RETARGET_MIN_NUM);
    if actual_x_min_den < expected_x_min_num {
        return scale_target(old_target, RETARGET_MIN_NUM, RETARGET_MIN_DEN);
    }
    let actual_x_max_den = actual_seconds.saturating_mul(RETARGET_MAX_DEN);
    let expected_x_max_num = expected.saturating_mul(RETARGET_MAX_NUM);
    if actual_x_max_den > expected_x_max_num {
        return scale_target(old_target, RETARGET_MAX_NUM, RETARGET_MAX_DEN);
    }

    // In-band: scale by actual / expected directly.
    scale_target(old_target, actual_seconds, expected)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reward_halves() {
        assert_eq!(reward_at_height(0), INITIAL_BLOCK_REWARD_BASE);
        assert_eq!(
            reward_at_height(HALVING_INTERVAL_BLOCKS - 1),
            INITIAL_BLOCK_REWARD_BASE
        );
        assert_eq!(
            reward_at_height(HALVING_INTERVAL_BLOCKS),
            INITIAL_BLOCK_REWARD_BASE / 2
        );
        assert_eq!(
            reward_at_height(HALVING_INTERVAL_BLOCKS * 2),
            INITIAL_BLOCK_REWARD_BASE / 4
        );
    }

    #[test]
    fn reward_eventually_zero() {
        assert_eq!(reward_at_height(HALVING_INTERVAL_BLOCKS * 100), 0);
    }

    #[test]
    fn boundary_predicates() {
        assert!(!is_halving_boundary(0));
        assert!(is_halving_boundary(HALVING_INTERVAL_BLOCKS));
        assert!(!is_retarget_boundary(0));
        assert!(is_retarget_boundary(RETARGET_INTERVAL_BLOCKS));
    }

    /// Build a target with `0x80` at byte 16 (mid-bit set, room for 2x and 0.5x).
    fn mid_target() -> [u8; 32] {
        let mut t = [0u8; 32];
        t[16] = 0x80;
        t
    }

    #[test]
    fn retarget_in_band_scales_proportionally() {
        // actual = 1.5x expected → target should be 1.5x bigger (easier).
        let actual = RETARGET_TARGET_SECONDS * 3 / 2;
        let new = next_target(&mid_target(), actual);
        // Reconstruct expected via scale_target directly.
        let manual = scale_target(&mid_target(), actual, RETARGET_TARGET_SECONDS);
        assert_eq!(new, manual);
    }

    #[test]
    fn retarget_clamps_too_slow_at_2x() {
        // actual = 5x expected (way too slow) → ratio clamps at 2.0 → target doubles.
        let actual = RETARGET_TARGET_SECONDS * 5;
        let new = next_target(&mid_target(), actual);
        let max_clamped = scale_target(&mid_target(), 2, 1);
        assert_eq!(new, max_clamped);
    }

    #[test]
    fn retarget_clamps_too_fast_at_half() {
        // actual = 0.1x expected (way too fast) → ratio clamps at 0.5 → target halves.
        let actual = RETARGET_TARGET_SECONDS / 10;
        let new = next_target(&mid_target(), actual);
        let min_clamped = scale_target(&mid_target(), 1, 2);
        assert_eq!(new, min_clamped);
    }

    #[test]
    fn retarget_zero_elapsed_clamps_min() {
        let new = next_target(&mid_target(), 0);
        assert_eq!(new, scale_target(&mid_target(), 1, 2));
    }
}
