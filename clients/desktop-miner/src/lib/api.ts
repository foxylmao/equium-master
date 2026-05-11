// Thin typed wrapper around the Tauri command surface exposed by Rust.
// Keeping these in one file means component code never deals with raw
// `invoke` strings (so renames are caught by tsc).

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type WalletStatus =
  | { status: "needs-setup"; pubkey: null }
  | { status: "needs-unlock"; pubkey: string }
  | { status: "unlocked"; pubkey: string };

export type Settings = {
  rpc_url: string;
  cluster: string;
};

export type ProgramState = {
  block_height: number;
  mining_open: boolean;
  current_target_hex: string;
  epoch_reward: number;
  equihash_n: number;
  equihash_k: number;
  mint: string;
};

export type Balances = {
  sol_lamports: number;
  eqm_base: number;
  pubkey: string;
};

export type MinerStats = {
  blocks_mined: number;
  total_earned_base: number;
  cumulative_nonces: number;
  started_at_unix_ms: number;
  try_in_round: number;
  last_log: string;
};

export type MinerStatus = {
  running: boolean;
  stats: MinerStats;
};

export type LogLevel = "info" | "ok" | "err";

export type LogEvent = { level: LogLevel; message: string };
export type AttemptEvent = {
  try_in_round: number;
  above_target: boolean;
  solve_ms: number;
  hashrate_hs: number;
  cumulative_nonces: number;
};
export type BlockMinedEvent = {
  height: number;
  reward_base: number;
  signature: string;
  total_earned_base: number;
  blocks_mined: number;
};
export type RoundEvent = {
  height: number;
  reward_base: number;
  target_prefix_hex: string;
};
export type StatusEvent = { running: boolean; reason: string | null };

// Wallet
export const walletStatus = () =>
  invoke<WalletStatus>("wallet_status");
export const createWallet = (password: string) =>
  invoke<WalletStatus>("create_wallet", { password });
export const importWallet = (secret: string, password: string) =>
  invoke<WalletStatus>("import_wallet", { secret, password });
export const unlockWallet = (password: string) =>
  invoke<WalletStatus>("unlock_wallet", { password });
export const lockWallet = () => invoke<WalletStatus>("lock_wallet");
export const forgetWallet = () => invoke<WalletStatus>("forget_wallet");
export const exportSecret = () => invoke<string>("export_secret");

// Settings & on-chain
export const getSettings = () => invoke<Settings>("get_settings");
export const setRpcUrl = (url: string) =>
  invoke<Settings>("set_rpc_url", { url });
export const getProgramState = () =>
  invoke<ProgramState>("get_program_state");
export const getWalletBalances = () =>
  invoke<Balances>("get_wallet_balances");

// Mining
export const startMining = () => invoke<MinerStatus>("start_mining");
export const stopMining = () => invoke<MinerStatus>("stop_mining");
export const minerStatus = () => invoke<MinerStatus>("miner_status");

// Sending
export type SendResult = { signature: string };
export const sendSol = (to: string, solAmount: number) =>
  invoke<SendResult>("send_sol", { to, solAmount });
export const sendEqm = (to: string, eqmAmount: number) =>
  invoke<SendResult>("send_eqm", { to, eqmAmount });

// Event helpers (return Unlisten functions)
export const onMinerLog = (cb: (e: LogEvent) => void): Promise<UnlistenFn> =>
  listen<LogEvent>("miner://log", (ev) => cb(ev.payload));
export const onMinerAttempt = (
  cb: (e: AttemptEvent) => void
): Promise<UnlistenFn> =>
  listen<AttemptEvent>("miner://attempt", (ev) => cb(ev.payload));
export const onMinerBlock = (
  cb: (e: BlockMinedEvent) => void
): Promise<UnlistenFn> =>
  listen<BlockMinedEvent>("miner://block", (ev) => cb(ev.payload));
export const onMinerRound = (
  cb: (e: RoundEvent) => void
): Promise<UnlistenFn> =>
  listen<RoundEvent>("miner://round", (ev) => cb(ev.payload));
export const onMinerStatus = (
  cb: (e: StatusEvent) => void
): Promise<UnlistenFn> =>
  listen<StatusEvent>("miner://status", (ev) => cb(ev.payload));
