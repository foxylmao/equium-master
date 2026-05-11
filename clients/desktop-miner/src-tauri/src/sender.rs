//! SOL + EQM transfers initiated from the desktop UI. Mirrors what the
//! browser miner does in `SendModal.tsx`, but we build/sign/send the tx
//! natively here so the renderer never sees the keypair.

use std::str::FromStr;
use std::sync::Arc;

use anchor_spl::associated_token::get_associated_token_address_with_program_id;
use parking_lot::Mutex;
use serde::Serialize;
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{Keypair, Signer};
use solana_sdk::system_instruction;
use solana_sdk::transaction::Transaction;
use tauri::State;

use crate::AppState;

type SharedState<'a> = State<'a, Arc<Mutex<AppState>>>;

const SPL_TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const ASSOCIATED_TOKEN_PROGRAM_ID: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

#[derive(Serialize)]
pub struct SendResult {
    pub signature: String,
}

#[tauri::command]
pub fn send_sol(
    state: SharedState<'_>,
    to: String,
    sol_amount: f64,
) -> Result<SendResult, String> {
    let (rpc_url, keypair_bytes) = clone_signing_inputs(&state)?;
    let kp = Keypair::from_bytes(&keypair_bytes).map_err(|e| e.to_string())?;
    let from = kp.pubkey();
    let to_pk = Pubkey::from_str(to.trim()).map_err(|_| "invalid recipient address".to_string())?;
    if to_pk == from {
        return Err("can't send to your own address".into());
    }
    let lamports = (sol_amount * 1_000_000_000.0).round() as u64;
    if lamports == 0 {
        return Err("amount must be greater than zero".into());
    }

    let rpc = RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed());
    let recent = rpc.get_latest_blockhash().map_err(|e| e.to_string())?;
    let ix = system_instruction::transfer(&from, &to_pk, lamports);
    let tx = Transaction::new_signed_with_payer(&[ix], Some(&from), &[&kp], recent);
    let sig = rpc
        .send_and_confirm_transaction(&tx)
        .map_err(|e| classify_send_err(&e.to_string()))?;
    Ok(SendResult {
        signature: sig.to_string(),
    })
}

#[tauri::command]
pub fn send_eqm(
    state: SharedState<'_>,
    to: String,
    eqm_amount: f64,
) -> Result<SendResult, String> {
    let (rpc_url, keypair_bytes) = clone_signing_inputs(&state)?;
    let kp = Keypair::from_bytes(&keypair_bytes).map_err(|e| e.to_string())?;
    let from = kp.pubkey();
    let to_pk = Pubkey::from_str(to.trim()).map_err(|_| "invalid recipient address".to_string())?;
    if to_pk == from {
        return Err("can't send to your own address".into());
    }
    let base_units = (eqm_amount * 1_000_000.0).round() as u64;
    if base_units == 0 {
        return Err("amount must be greater than zero".into());
    }

    let rpc = RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed());

    let mint = crate::settings::current_program_mint(&rpc)
        .map_err(|e| format!("couldn't read mint: {e}"))?;
    let mint_acct = rpc.get_account(&mint).map_err(|e| e.to_string())?;
    let token_program = mint_acct.owner;

    let source_ata = get_associated_token_address_with_program_id(&from, &mint, &token_program);
    let dest_ata = get_associated_token_address_with_program_id(&to_pk, &mint, &token_program);

    let mut ixs: Vec<Instruction> = Vec::new();

    // If the destination ATA doesn't exist, create it. We pay the rent.
    if rpc.get_account(&dest_ata).is_err() {
        ixs.push(create_associated_token_account_ix(
            &from,
            &to_pk,
            &mint,
            &token_program,
        ));
    }

    ixs.push(transfer_checked_ix(
        &token_program,
        &source_ata,
        &mint,
        &dest_ata,
        &from,
        base_units,
        6, // EQM decimals
    ));

    let recent = rpc.get_latest_blockhash().map_err(|e| e.to_string())?;
    let tx = Transaction::new_signed_with_payer(&ixs, Some(&from), &[&kp], recent);
    let sig = rpc
        .send_and_confirm_transaction(&tx)
        .map_err(|e| classify_send_err(&e.to_string()))?;
    Ok(SendResult {
        signature: sig.to_string(),
    })
}

fn clone_signing_inputs(
    state: &Arc<Mutex<AppState>>,
) -> Result<(String, [u8; 64]), String> {
    let g = state.lock();
    let kp = g
        .unlocked
        .as_ref()
        .ok_or_else(|| "wallet is locked".to_string())?;
    Ok((g.settings.effective_rpc_url(), kp.to_bytes()))
}

/// `spl_token::instruction::transfer_checked` hand-rolled so we don't need
/// to pull the whole `spl-token` crate as a direct dep (anchor-spl re-exports
/// utilities but its `transfer_checked` instruction lives behind a feature
/// gate). The layout matches both classic SPL and Token-2022 byte-for-byte.
fn transfer_checked_ix(
    token_program: &Pubkey,
    source: &Pubkey,
    mint: &Pubkey,
    destination: &Pubkey,
    authority: &Pubkey,
    amount: u64,
    decimals: u8,
) -> Instruction {
    // TransferChecked = 12
    let mut data = Vec::with_capacity(1 + 8 + 1);
    data.push(12u8);
    data.extend_from_slice(&amount.to_le_bytes());
    data.push(decimals);
    Instruction {
        program_id: *token_program,
        accounts: vec![
            AccountMeta::new(*source, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new(*destination, false),
            AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

fn create_associated_token_account_ix(
    payer: &Pubkey,
    owner: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
) -> Instruction {
    let ata = get_associated_token_address_with_program_id(owner, mint, token_program);
    let assoc_program = Pubkey::from_str(ASSOCIATED_TOKEN_PROGRAM_ID).unwrap();
    let system_program = solana_sdk::system_program::id();
    Instruction {
        program_id: assoc_program,
        accounts: vec![
            AccountMeta::new(*payer, true),
            AccountMeta::new(ata, false),
            AccountMeta::new_readonly(*owner, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new_readonly(system_program, false),
            AccountMeta::new_readonly(*token_program, false),
        ],
        // discriminant 0 = Create (idempotent variant uses 1)
        data: vec![1],
    }
}

fn classify_send_err(s: &str) -> String {
    if s.contains("InsufficientFundsForRent") {
        "not enough SOL to cover rent / fees".into()
    } else if s.contains("insufficient lamports") {
        "not enough SOL in this wallet".into()
    } else if s.contains("insufficient funds") || s.contains("0x1") {
        "not enough balance".into()
    } else if s.len() > 200 {
        format!("{}…", &s[..200])
    } else {
        s.to_string()
    }
}

// Suppress warnings on unused constants if either token program ID lands
// here without runtime use (kept for documentation).
#[allow(dead_code)]
const _: &[&str] = &[SPL_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
