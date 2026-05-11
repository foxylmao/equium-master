//! User settings + read-only on-chain state queries.

use crate::AppState;
use anchor_lang::AccountDeserialize;
use anyhow::Context;
use parking_lot::Mutex;
use serde::Serialize;
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Signer;
use std::str::FromStr;
use std::sync::Arc;
use tauri::State;

use equium::state::{CONFIG_SEED, EquiumConfig, VAULT_SEED};

type SharedState<'a> = State<'a, Arc<Mutex<AppState>>>;

#[derive(Serialize, Clone)]
pub struct Settings {
    pub rpc_url: String,
    pub cluster: String,
}

#[tauri::command]
pub fn get_settings(state: SharedState<'_>) -> Settings {
    let g = state.lock();
    Settings {
        rpc_url: g.settings.rpc_url.clone(),
        cluster: g.settings.cluster.clone(),
    }
}

#[tauri::command]
pub fn set_rpc_url(state: SharedState<'_>, url: String) -> Result<Settings, String> {
    {
        let mut g = state.lock();
        g.settings.rpc_url = url.trim().to_string();
        g.save_settings().map_err(|e| e.to_string())?;
    }
    Ok(get_settings(state))
}

#[derive(Serialize)]
pub struct ProgramState {
    pub block_height: u64,
    pub mining_open: bool,
    pub current_target_hex: String,
    pub epoch_reward: u64,
    pub equihash_n: u32,
    pub equihash_k: u32,
    pub mint: String,
}

#[tauri::command]
pub fn get_program_state(state: SharedState<'_>) -> Result<ProgramState, String> {
    let rpc_url = state.lock().settings.effective_rpc_url();
    let conn = RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed());
    let program_id = equium::ID;
    let (config_pda, _) = Pubkey::find_program_address(&[CONFIG_SEED], &program_id);
    let acct = conn.get_account(&config_pda).map_err(|e| e.to_string())?;
    let mut data = acct.data.as_slice();
    let cfg = EquiumConfig::try_deserialize(&mut data).map_err(|e| e.to_string())?;
    Ok(ProgramState {
        block_height: cfg.block_height,
        mining_open: cfg.mining_open,
        current_target_hex: hex::encode(cfg.current_target),
        epoch_reward: cfg.current_epoch_reward,
        equihash_n: cfg.equihash_n,
        equihash_k: cfg.equihash_k,
        mint: cfg.mint.to_string(),
    })
}

#[derive(Serialize)]
pub struct Balances {
    pub sol_lamports: u64,
    pub eqm_base: u64,
    pub pubkey: String,
}

#[tauri::command]
pub fn get_wallet_balances(state: SharedState<'_>) -> Result<Balances, String> {
    let (rpc_url, pubkey, eqm_mint) = {
        let g = state.lock();
        let url = g.settings.effective_rpc_url();
        let kp = g
            .unlocked
            .as_ref()
            .ok_or_else(|| "wallet locked".to_string())?;
        let mint_str = match get_program_state_inner(&url) {
            Ok(s) => s.mint,
            Err(_) => String::new(),
        };
        (url, kp.pubkey(), mint_str)
    };
    let conn = RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed());
    let sol_lamports = conn.get_balance(&pubkey).map_err(|e| e.to_string())?;
    let mut eqm_base = 0u64;
    if !eqm_mint.is_empty() {
        if let Ok(mint_pk) = Pubkey::from_str(&eqm_mint) {
            // Fetch the mint to know which token program owns it, then derive ATA
            if let Ok(mint_acct) = conn.get_account(&mint_pk) {
                let token_program = mint_acct.owner;
                let ata = derive_ata(&pubkey, &mint_pk, &token_program);
                if let Ok(acct) = conn.get_token_account_balance(&ata) {
                    if let Ok(parsed) = acct.amount.parse::<u64>() {
                        eqm_base = parsed;
                    }
                }
            }
        }
    }
    let _ = VAULT_SEED; // silence unused warning
    Ok(Balances {
        sol_lamports,
        eqm_base,
        pubkey: pubkey.to_string(),
    })
}

fn get_program_state_inner(rpc_url: &str) -> anyhow::Result<ProgramState> {
    let conn = RpcClient::new_with_commitment(
        rpc_url.to_string(),
        CommitmentConfig::confirmed(),
    );
    let program_id = equium::ID;
    let (config_pda, _) = Pubkey::find_program_address(&[CONFIG_SEED], &program_id);
    let acct = conn.get_account(&config_pda).context("config not found")?;
    let mut data = acct.data.as_slice();
    let cfg = EquiumConfig::try_deserialize(&mut data)?;
    Ok(ProgramState {
        block_height: cfg.block_height,
        mining_open: cfg.mining_open,
        current_target_hex: hex::encode(cfg.current_target),
        epoch_reward: cfg.current_epoch_reward,
        equihash_n: cfg.equihash_n,
        equihash_k: cfg.equihash_k,
        mint: cfg.mint.to_string(),
    })
}

fn derive_ata(owner: &Pubkey, mint: &Pubkey, token_program: &Pubkey) -> Pubkey {
    anchor_spl::associated_token::get_associated_token_address_with_program_id(
        owner,
        mint,
        token_program,
    )
}

/// Fetch the program's configured mint from the CONFIG PDA. Used by the
/// sender module so it doesn't have to duplicate the deserialization logic.
pub fn current_program_mint(rpc: &RpcClient) -> anyhow::Result<Pubkey> {
    let program_id = equium::ID;
    let (config_pda, _) = Pubkey::find_program_address(&[CONFIG_SEED], &program_id);
    let acct = rpc.get_account(&config_pda).context("config not found")?;
    let mut data = acct.data.as_slice();
    let cfg = EquiumConfig::try_deserialize(&mut data)?;
    Ok(cfg.mint)
}
