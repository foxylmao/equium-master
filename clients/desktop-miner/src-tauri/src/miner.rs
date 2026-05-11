//! Background mining loop driven from the Tauri frontend.
//!
//! Runs on a dedicated OS thread, not a tokio task. The work is all blocking
//! (Equihash solving + synchronous RPC), so there is no async benefit, and
//! avoiding the runtime sidesteps Tauri 2 / tokio runtime-handle issues
//! that were crashing the Windows build.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use anchor_lang::prelude::AccountMeta;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use parking_lot::Mutex;
use rand::RngCore;
use serde::Serialize;
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::compute_budget::ComputeBudgetInstruction;
use solana_sdk::instruction::Instruction;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{Keypair, Signer};
use solana_sdk::system_program;
use solana_sdk::sysvar;
use solana_sdk::transaction::Transaction;
use tauri::{AppHandle, Emitter, State};

use equihash_core::challenge::{build_input, solution_hash};
use equihash_core::solver::solve;
use equihash_core::target::hash_under_target;
use equium::state::{CONFIG_SEED, EquiumConfig, VAULT_SEED};

use crate::state::MinerStats;
use crate::AppState;

type SharedState<'a> = State<'a, Arc<Mutex<AppState>>>;

const MAX_NONCES_PER_ROUND: u64 = 4096;
const CU_LIMIT: u32 = 1_400_000;

#[derive(Serialize, Clone)]
pub struct MinerStatusPayload {
    pub running: bool,
    pub stats: MinerStats,
}

#[derive(Serialize, Clone)]
struct AttemptEvent {
    try_in_round: u32,
    above_target: bool,
    solve_ms: u64,
    hashrate_hs: f64,
    cumulative_nonces: u64,
}

#[derive(Serialize, Clone)]
struct BlockMinedEvent {
    height: u64,
    reward_base: u64,
    signature: String,
    total_earned_base: u64,
    blocks_mined: u64,
}

#[derive(Serialize, Clone)]
struct LogEvent {
    level: &'static str,
    message: String,
}

#[derive(Serialize, Clone)]
struct RoundEvent {
    height: u64,
    reward_base: u64,
    target_prefix_hex: String,
}

#[derive(Serialize, Clone)]
struct StatusEvent {
    running: bool,
    reason: Option<String>,
}

#[tauri::command]
pub fn miner_status(state: SharedState<'_>) -> MinerStatusPayload {
    let g = state.lock();
    MinerStatusPayload {
        running: g.miner.running,
        stats: g.miner.stats.clone(),
    }
}

#[tauri::command]
pub fn start_mining(
    state: SharedState<'_>,
    app: AppHandle,
) -> Result<MinerStatusPayload, String> {
    let (rpc_url, keypair_bytes) = {
        let g = state.lock();
        if g.miner.running {
            return Err("miner already running".into());
        }
        let kp = g
            .unlocked
            .as_ref()
            .ok_or_else(|| "wallet is locked".to_string())?;
        (g.settings.effective_rpc_url(), kp.to_bytes())
    };

    let stop_flag = Arc::new(AtomicBool::new(false));

    {
        let mut g = state.lock();
        g.miner.running = true;
        g.miner.stats = MinerStats {
            started_at_unix_ms: now_unix_ms(),
            ..Default::default()
        };
        g.miner.stop_flag = Some(stop_flag.clone());
    }

    let state_arc: Arc<Mutex<AppState>> = (*state).clone();
    let app_handle = app.clone();

    std::thread::Builder::new()
        .name("equium-miner".into())
        .spawn(move || {
            // Catch panics so the UI surfaces a useful error rather than a
            // silent process death.
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                run_mining_loop(
                    state_arc.clone(),
                    app_handle.clone(),
                    rpc_url,
                    keypair_bytes,
                    stop_flag,
                )
            }));
            if let Err(e) = result {
                let msg = if let Some(s) = e.downcast_ref::<&str>() {
                    (*s).to_string()
                } else if let Some(s) = e.downcast_ref::<String>() {
                    s.clone()
                } else {
                    "miner panicked".to_string()
                };
                emit_log(&app_handle, "err", format!("miner crashed: {msg}"));
                emit_status(&app_handle, false, Some(msg.clone()));
                let mut g = state_arc.lock();
                g.miner.running = false;
                g.miner.stop_flag = None;
            }
        })
        .map_err(|e| format!("failed to spawn miner thread: {e}"))?;

    Ok(MinerStatusPayload {
        running: true,
        stats: state.lock().miner.stats.clone(),
    })
}

#[tauri::command]
pub fn stop_mining(state: SharedState<'_>) -> MinerStatusPayload {
    let mut g = state.lock();
    if let Some(flag) = g.miner.stop_flag.take() {
        flag.store(true, Ordering::SeqCst);
    }
    g.miner.running = false;
    MinerStatusPayload {
        running: false,
        stats: g.miner.stats.clone(),
    }
}

fn run_mining_loop(
    state: Arc<Mutex<AppState>>,
    app: AppHandle,
    rpc_url: String,
    keypair_bytes: [u8; 64],
    stop_flag: Arc<AtomicBool>,
) {
    let miner_kp = match Keypair::from_bytes(&keypair_bytes) {
        Ok(k) => k,
        Err(e) => {
            emit_log(&app, "err", format!("invalid keypair: {e}"));
            mark_stopped(&state);
            emit_status(&app, false, Some(format!("invalid keypair: {e}")));
            return;
        }
    };
    let miner = miner_kp.pubkey();

    let program_id = equium::ID;
    let rpc =
        RpcClient::new_with_commitment(rpc_url.clone(), CommitmentConfig::confirmed());
    let (config_pda, _) = Pubkey::find_program_address(&[CONFIG_SEED], &program_id);
    let (vault_pda, _) = Pubkey::find_program_address(&[VAULT_SEED], &program_id);

    emit_log(&app, "info", format!("starting miner — {}", short_pk(&miner)));
    emit_status(&app, true, None);

    let token_program_id = match fetch_config(&rpc, &config_pda).and_then(|cfg| {
        rpc.get_account(&cfg.mint)
            .map(|m| m.owner)
            .map_err(|e| anyhow::anyhow!(e))
    }) {
        Ok(p) => p,
        Err(e) => {
            emit_log(&app, "err", format!("could not read config/mint: {e}"));
            mark_stopped(&state);
            emit_status(&app, false, Some(format!("rpc: {e}")));
            return;
        }
    };

    let started_at = Instant::now();
    let mut current_height: u64 = u64::MAX;
    let mut try_in_round: u32 = 0;
    let mut total_nonces: u64 = 0;
    let mut last_height_change_at = Instant::now();
    let mut last_advance_attempt_at: Option<Instant> = None;

    loop {
        if stop_flag.load(Ordering::SeqCst) {
            break;
        }

        let cfg = match fetch_config(&rpc, &config_pda) {
            Ok(c) => c,
            Err(e) => {
                emit_log(
                    &app,
                    "err",
                    format!(
                        "rpc error reading config: {}",
                        trim(&e.to_string(), 120)
                    ),
                );
                if sleep_or_stop(&stop_flag, Duration::from_millis(2500)) {
                    break;
                }
                continue;
            }
        };

        if !cfg.mining_open {
            emit_log(&app, "err", "mining is not open yet (vault unfunded)".into());
            if sleep_or_stop(&stop_flag, Duration::from_secs(5)) {
                break;
            }
            continue;
        }

        if cfg.block_height != current_height {
            current_height = cfg.block_height;
            try_in_round = 0;
            last_height_change_at = Instant::now();
            last_advance_attempt_at = None;
            let _ = app.emit(
                "miner://round",
                RoundEvent {
                    height: cfg.block_height,
                    reward_base: cfg.current_epoch_reward,
                    target_prefix_hex: hex::encode(&cfg.current_target[..4]),
                },
            );
            emit_log(
                &app,
                "info",
                format!(
                    "round #{} opened · reward {} EQM",
                    cfg.block_height,
                    format_base(cfg.current_epoch_reward)
                ),
            );
        }

        let miner_ata = derive_ata(&miner, &cfg.mint, &token_program_id);

        // Empty-round watchdog. If chain progress has stalled, fire
        // `advance_empty_round` so the next round can open. 75s wait + 30s
        // cooldown matches the CLI miner.
        let stall_for = last_height_change_at.elapsed();
        let cooled_down = last_advance_attempt_at
            .map(|t| t.elapsed() >= Duration::from_secs(30))
            .unwrap_or(true);
        if stall_for >= Duration::from_secs(75) && cooled_down {
            emit_log(
                &app,
                "info",
                format!(
                    "round stalled {}s — calling advance_empty_round",
                    stall_for.as_secs()
                ),
            );
            last_advance_attempt_at = Some(Instant::now());
            match submit_advance_empty_round(&rpc, &miner_kp, &program_id, &config_pda) {
                Ok(sig) => emit_log(
                    &app,
                    "ok",
                    format!("↳ advanced empty round · {}", short_sig(&sig)),
                ),
                Err(e) => {
                    let reason = if e.to_string().contains("RoundStillActive") {
                        "another miner beat us to it"
                    } else {
                        "couldn't advance"
                    };
                    emit_log(&app, "info", format!("↳ {reason}"));
                }
            }
            // Next loop iteration will refetch config.
            continue;
        }

        let input = build_input(&cfg.current_challenge, &miner.to_bytes(), cfg.block_height);
        let mut rng = rand::thread_rng();
        let mut counter: u64 = 0;
        let solve_started = Instant::now();
        let solution = solve(cfg.equihash_n, cfg.equihash_k, &input, || {
            counter += 1;
            if counter > MAX_NONCES_PER_ROUND {
                return None;
            }
            let mut n = [0u8; 32];
            rng.fill_bytes(&mut n);
            Some(n)
        });

        let solve_ms = solve_started.elapsed().as_millis() as u64;
        total_nonces = total_nonces.saturating_add(counter);

        let solution = match solution {
            Ok(s) => s,
            Err(_) => {
                emit_log(&app, "info", "solver exhausted nonces — refreshing".into());
                continue;
            }
        };

        try_in_round = try_in_round.saturating_add(1);
        let elapsed_sec = started_at.elapsed().as_secs_f64().max(0.001);
        let hashrate = total_nonces as f64 / elapsed_sec;

        let cand_hash = solution_hash(&solution.soln_indices, &input);
        let above = !hash_under_target(&cand_hash, &cfg.current_target);

        {
            let mut g = state.lock();
            g.miner.stats.try_in_round = try_in_round;
            g.miner.stats.cumulative_nonces = total_nonces;
        }
        let _ = app.emit(
            "miner://attempt",
            AttemptEvent {
                try_in_round,
                above_target: above,
                solve_ms,
                hashrate_hs: hashrate,
                cumulative_nonces: total_nonces,
            },
        );

        if above {
            emit_log(
                &app,
                "info",
                format!(
                    "try #{} · above target · {}ms · {}",
                    try_in_round,
                    solve_ms,
                    fmt_hashrate(hashrate)
                ),
            );
            continue;
        }

        match submit_mine(
            &rpc,
            &miner_kp,
            &program_id,
            &config_pda,
            &cfg,
            &vault_pda,
            &miner_ata,
            &token_program_id,
            &solution.nonce,
            solution.soln_indices.clone(),
            CU_LIMIT,
        ) {
            Ok(sig) => {
                let (blocks, total_base) = {
                    let mut g = state.lock();
                    g.miner.stats.blocks_mined =
                        g.miner.stats.blocks_mined.saturating_add(1);
                    g.miner.stats.total_earned_base = g
                        .miner
                        .stats
                        .total_earned_base
                        .saturating_add(cfg.current_epoch_reward);
                    g.miner.stats.last_log = format!(
                        "mined #{} (+{} EQM)",
                        cfg.block_height,
                        format_base(cfg.current_epoch_reward)
                    );
                    (g.miner.stats.blocks_mined, g.miner.stats.total_earned_base)
                };
                let _ = app.emit(
                    "miner://block",
                    BlockMinedEvent {
                        height: cfg.block_height,
                        reward_base: cfg.current_epoch_reward,
                        signature: sig.clone(),
                        total_earned_base: total_base,
                        blocks_mined: blocks,
                    },
                );
                emit_log(
                    &app,
                    "ok",
                    format!(
                        "✓ mined #{} (+{} EQM) · {}",
                        cfg.block_height,
                        format_base(cfg.current_epoch_reward),
                        short_sig(&sig)
                    ),
                );
            }
            Err(e) => {
                let reason = classify_submit_err(&e.to_string());
                emit_log(&app, "err", format!("submit failed: {reason}"));
                if sleep_or_stop(&stop_flag, Duration::from_millis(400)) {
                    break;
                }
            }
        }
    }

    mark_stopped(&state);
    emit_status(&app, false, None);
    emit_log(&app, "info", "miner stopped".into());
}

fn sleep_or_stop(stop_flag: &Arc<AtomicBool>, dur: Duration) -> bool {
    let deadline = Instant::now() + dur;
    loop {
        if stop_flag.load(Ordering::SeqCst) {
            return true;
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return false;
        }
        std::thread::sleep(remaining.min(Duration::from_millis(100)));
    }
}

fn mark_stopped(state: &Arc<Mutex<AppState>>) {
    let mut g = state.lock();
    g.miner.running = false;
    g.miner.stop_flag = None;
}

fn emit_log(app: &AppHandle, level: &'static str, message: String) {
    let _ = app.emit("miner://log", LogEvent { level, message });
}

fn emit_status(app: &AppHandle, running: bool, reason: Option<String>) {
    let _ = app.emit("miner://status", StatusEvent { running, reason });
}

fn fetch_config(rpc: &RpcClient, config_pda: &Pubkey) -> anyhow::Result<EquiumConfig> {
    let acct = rpc.get_account(config_pda)?;
    let mut data = acct.data.as_slice();
    let cfg = EquiumConfig::try_deserialize(&mut data)?;
    Ok(cfg)
}

#[allow(clippy::too_many_arguments)]
fn submit_mine(
    rpc: &RpcClient,
    miner_kp: &Keypair,
    program_id: &Pubkey,
    config_pda: &Pubkey,
    cfg: &EquiumConfig,
    vault_pda: &Pubkey,
    miner_ata: &Pubkey,
    token_program_id: &Pubkey,
    nonce: &[u8; 32],
    soln_indices: Vec<u8>,
    cu_limit: u32,
) -> anyhow::Result<String> {
    let miner = miner_kp.pubkey();
    let accounts = equium::accounts::Mine {
        miner,
        config: *config_pda,
        mint: cfg.mint,
        mineable_vault: *vault_pda,
        miner_ata: *miner_ata,
        token_program: *token_program_id,
        associated_token_program: anchor_spl::associated_token::ID,
        system_program: system_program::ID,
        slot_hashes: sysvar::slot_hashes::ID,
    }
    .to_account_metas(None);
    let accounts: Vec<AccountMeta> = accounts
        .into_iter()
        .map(|m| AccountMeta {
            pubkey: m.pubkey,
            is_signer: m.is_signer,
            is_writable: m.is_writable,
        })
        .collect();
    let data = equium::instruction::Mine {
        nonce: *nonce,
        soln_indices,
    }
    .data();
    let ix = Instruction {
        program_id: *program_id,
        accounts,
        data,
    };
    let cu_ix = ComputeBudgetInstruction::set_compute_unit_limit(cu_limit);

    let recent = rpc.get_latest_blockhash()?;
    let tx =
        Transaction::new_signed_with_payer(&[cu_ix, ix], Some(&miner), &[miner_kp], recent);
    let sig = rpc.send_and_confirm_transaction(&tx)?;
    Ok(sig.to_string())
}

fn derive_ata(owner: &Pubkey, mint: &Pubkey, token_program: &Pubkey) -> Pubkey {
    anchor_spl::associated_token::get_associated_token_address_with_program_id(
        owner,
        mint,
        token_program,
    )
}

/// Permissionless instruction that closes a stalled round. Used by the
/// empty-round watchdog above so chain progress doesn't get stuck if no
/// miner finds a solution within the timeout window.
fn submit_advance_empty_round(
    rpc: &RpcClient,
    caller_kp: &Keypair,
    program_id: &Pubkey,
    config_pda: &Pubkey,
) -> anyhow::Result<String> {
    let caller = caller_kp.pubkey();
    let accounts = equium::accounts::AdvanceEmptyRound {
        caller,
        config: *config_pda,
        slot_hashes: sysvar::slot_hashes::ID,
    }
    .to_account_metas(None);
    let accounts: Vec<AccountMeta> = accounts
        .into_iter()
        .map(|m| AccountMeta {
            pubkey: m.pubkey,
            is_signer: m.is_signer,
            is_writable: m.is_writable,
        })
        .collect();
    let data = equium::instruction::AdvanceEmptyRound {}.data();
    let ix = Instruction {
        program_id: *program_id,
        accounts,
        data,
    };
    let recent = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&caller), &[caller_kp], recent);
    let sig = rpc.send_and_confirm_transaction(&tx)?;
    Ok(sig.to_string())
}

fn classify_submit_err(s: &str) -> &'static str {
    if s.contains("custom program error: 0x1773") || s.contains("AboveTarget") {
        "above target"
    } else if s.contains("custom program error: 0x1772") || s.contains("InvalidEquihash") {
        "invalid equihash solution"
    } else if s.contains("custom program error: 0x1774") || s.contains("StaleChallenge") {
        "stale challenge"
    } else if s.contains("BlockhashNotFound") || s.contains("blockhash not found") {
        "blockhash expired"
    } else if s.contains("insufficient lamports") {
        "not enough SOL for fees"
    } else {
        "submit error"
    }
}

fn fmt_hashrate(h: f64) -> String {
    if h >= 1000.0 {
        format!("{:.1} kH/s", h / 1000.0)
    } else {
        format!("{:.1} H/s", h)
    }
}

fn format_base(base: u64) -> String {
    let whole = base / 1_000_000;
    let frac = base % 1_000_000;
    if frac == 0 {
        whole.to_string()
    } else {
        format!("{}.{:06}", whole, frac)
            .trim_end_matches('0')
            .to_string()
    }
}

fn short_pk(pk: &Pubkey) -> String {
    let s = pk.to_string();
    format!("{}…{}", &s[..4], &s[s.len() - 4..])
}

fn short_sig(s: &str) -> String {
    if s.len() <= 12 {
        s.to_string()
    } else {
        format!("{}…{}", &s[..6], &s[s.len() - 6..])
    }
}

fn trim(s: &str, n: usize) -> String {
    if s.len() > n {
        format!("{}…", &s[..n])
    } else {
        s.to_string()
    }
}

fn now_unix_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
