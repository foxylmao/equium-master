// Mining engine: orchestrates a pool of Web Worker Equihash solvers + RPC
// reads + transaction signing/submitting. Designed for the browser miner UI;
// the CLI miner in Rust does the same work via solana-client.
//
// Parallelism: spawns N workers (N = hardware concurrency - 1, capped). Each
// worker runs an independent solve loop with its own random seed; whenever one
// finds a below-target solution, the main loop submits it. This gives a near-
// linear speedup vs a single worker on multi-core machines.

import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import {
  buildMineTx,
  detectTokenProgram,
  fetchConfig,
  hashUnderTarget,
  submitAdvanceEmptyRound,
  type EquiumConfig,
} from "./program";

export interface MinerCallbacks {
  log: (level: "info" | "ok" | "err", msg: string) => void;
  onConfig: (cfg: EquiumConfig) => void;
  onAttempt: (info: {
    tryNum: number;
    aboveTarget: boolean;
    solveMs: number;
    cumulativeNonces: number;
    elapsedSec: number;
  }) => void;
  onBlockMined: (info: {
    height: bigint;
    sig: string;
    rewardBase: bigint;
  }) => void;
  onStatus: (
    s: "idle" | "solving" | "submitting" | "stopped" | "error"
  ) => void;
}

export interface MinerOptions {
  connection: Connection;
  program: Program<any>;
  miner: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  cb: MinerCallbacks;
  /** Override worker count. Defaults to hardwareConcurrency - 1, capped to 8. */
  workerCount?: number;
}

export interface MinerHandle {
  stop: () => void;
}

interface SolveResponse {
  type: "solved" | "no-solution" | "error";
  jobId: number;
  nonce?: Uint8Array;
  solnIndices?: Uint8Array;
  attempts?: number;
  solveMs?: number;
  message?: string;
}

interface SolverSlot {
  worker: Worker;
  busy: boolean;
}

const DEFAULT_MAX_WORKERS = 8;

function pickWorkerCount(override?: number): number {
  if (override && override > 0) return Math.min(override, 32);
  const hw =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  return Math.max(1, Math.min(hw - 1, DEFAULT_MAX_WORKERS));
}

export function startMiner(opts: MinerOptions): MinerHandle {
  const { connection, program, miner, signTransaction, cb } = opts;
  const workerCount = pickWorkerCount(opts.workerCount);
  let stopped = false;
  let nextJobId = 1;
  let tokenProgramCache: PublicKey | null = null;
  let cumulativeNonces = 0;
  let tryInRound = 0;
  let currentConfig: EquiumConfig | null = null;
  let submitting = false;
  const startedAt = Date.now();

  const slots: SolverSlot[] = Array.from({ length: workerCount }, () => ({
    worker: new Worker("/wasm/miner.worker.js", { type: "module" }),
    busy: false,
  }));

  cb.log(
    "info",
    `solver pool: ${workerCount} worker${workerCount === 1 ? "" : "s"}`
  );

  const stop = () => {
    stopped = true;
    for (const slot of slots) {
      slot.worker.terminate();
    }
    cb.onStatus("stopped");
  };

  /** Dispatch a single solve job to a specific worker. The handler runs the
   * full lifecycle: receive → target-check → maybe submit → re-dispatch.  */
  const dispatchTo = (slot: SolverSlot, cfg: EquiumConfig) => {
    if (stopped) return;
    slot.busy = true;

    const seed = new Uint8Array(32);
    crypto.getRandomValues(seed);
    const jobId = nextJobId++;

    const onMessage = async (e: MessageEvent<SolveResponse>) => {
      if (e.data.jobId !== jobId) return;
      slot.worker.removeEventListener("message", onMessage);
      slot.busy = false;
      if (stopped) return;

      const resp = e.data;

      if (resp.type === "error") {
        cb.log("err", `solver error: ${resp.message}`);
        // Re-dispatch after a brief pause to avoid a tight error loop.
        setTimeout(() => {
          if (!stopped && currentConfig) dispatchTo(slot, currentConfig);
        }, 1000);
        return;
      }

      const attempts = resp.attempts ?? 1;
      cumulativeNonces += attempts;
      const elapsedSec = (Date.now() - startedAt) / 1000;

      if (resp.type === "no-solution") {
        cb.onAttempt({
          tryNum: tryInRound,
          aboveTarget: true,
          solveMs: resp.solveMs ?? 0,
          cumulativeNonces,
          elapsedSec,
        });
        if (!stopped && currentConfig) dispatchTo(slot, currentConfig);
        return;
      }

      // Off-chain target check
      const inputBlock = buildInputBlock(
        cfg.currentChallenge,
        miner.toBytes(),
        cfg.blockHeight
      );
      const candHash = await sha256(
        concatBytes(resp.solnIndices!, inputBlock)
      );
      const aboveTarget = !hashUnderTarget(candHash, cfg.currentTarget);

      tryInRound += 1;
      cb.onAttempt({
        tryNum: tryInRound,
        aboveTarget,
        solveMs: resp.solveMs ?? 0,
        cumulativeNonces,
        elapsedSec,
      });

      if (aboveTarget) {
        if (!stopped && currentConfig) dispatchTo(slot, currentConfig);
        return;
      }

      // Below target — submit if no other worker is mid-submit for this round.
      if (submitting) {
        // Another worker already won this round; re-dispatch for the next.
        if (!stopped && currentConfig) dispatchTo(slot, currentConfig);
        return;
      }
      submitting = true;
      cb.onStatus("submitting");
      try {
        if (!tokenProgramCache) {
          tokenProgramCache = await detectTokenProgram(connection, cfg.mint);
        }
        const tx = await buildMineTx({
          program,
          miner,
          mint: cfg.mint,
          tokenProgram: tokenProgramCache,
          nonce: resp.nonce!,
          solnIndices: resp.solnIndices!,
        });
        const recent = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = recent.blockhash;
        tx.feePayer = miner;
        const signed = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: true,
        });

        // Don't use `confirmTransaction` — its blockhash-validity window is
        // narrow and Helius/devnet often misses the confirmation event even
        // when the tx lands. Poll signature status directly with a longer
        // timeout, and inspect on-chain logs to detect actual rejection.
        const outcome = await waitForSignature(connection, sig, 90_000);
        if (outcome.kind === "failed") {
          throw new Error(`${outcome.reason} (${sig.slice(0, 8)}…)`);
        }
        if (outcome.kind === "lost") {
          // Tx never landed. The `finally` block re-dispatches the slot;
          // we just skip the success path so we don't credit a block.
          cb.log("err", `submit lost — tx didn't land within 90s`);
          return;
        }

        cb.onBlockMined({
          height: cfg.blockHeight,
          sig,
          rewardBase: cfg.currentEpochReward,
        });
        cb.log(
          "ok",
          `mined block ${cfg.blockHeight.toString()} (+${formatBase(cfg.currentEpochReward)} EQM)`
        );
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        cb.log("err", `submit failed: ${truncate(msg, 110)}`);
        await sleep(600);
      } finally {
        submitting = false;
        cb.onStatus("solving");
        if (!stopped && currentConfig) dispatchTo(slot, currentConfig);
      }
    };

    slot.worker.addEventListener("message", onMessage);
    slot.worker.postMessage({
      type: "solve",
      jobId,
      n: cfg.equihashN,
      k: cfg.equihashK,
      challenge: cfg.currentChallenge,
      miner: miner.toBytes(),
      height: cfg.blockHeight,
      maxAttempts: 4096,
      seed,
    });
  };

  // Top-level supervisor: keep config fresh, kick idle workers, handle network
  // failures. Workers self-redispatch after each result so this loop only
  // intervenes when config changes or things go wrong.
  (async () => {
    let lastHeight = -1n;
    let lastHeightChangeAt = Date.now();
    let lastAdvanceAttemptAt = 0;

    while (!stopped) {
      try {
        const cfg = await fetchConfig(program);
        if (!cfg) {
          cb.log("err", "Couldn't read on-chain config — retrying");
          await sleep(2500);
          continue;
        }
        cb.onConfig(cfg);
        currentConfig = cfg;

        if (!cfg.miningOpen) {
          cb.log(
            "err",
            "Mining is not open yet (admin hasn't funded the vault)"
          );
          await sleep(5000);
          continue;
        }

        if (cfg.blockHeight !== lastHeight) {
          lastHeight = cfg.blockHeight;
          lastHeightChangeAt = Date.now();
          lastAdvanceAttemptAt = 0;
          tryInRound = 0;
          cb.log(
            "info",
            `round #${cfg.blockHeight.toString()} opened — reward ${formatBase(cfg.currentEpochReward)} EQM`
          );
        }

        // Empty-round watchdog. If the chain hasn't moved in 75s, fire
        // advance_empty_round; back off 30s between attempts so racing
        // miners don't all spam fees.
        const stallMs = Date.now() - lastHeightChangeAt;
        const cooledDown = Date.now() - lastAdvanceAttemptAt >= 30_000;
        if (stallMs >= 75_000 && cooledDown && !submitting) {
          lastAdvanceAttemptAt = Date.now();
          cb.log(
            "info",
            `round stalled ${(stallMs / 1000).toFixed(0)}s — calling advance_empty_round`
          );
          try {
            const sig = await submitAdvanceEmptyRound(
              connection,
              program,
              miner,
              signTransaction
            );
            cb.log("ok", `↳ advanced empty round · ${sig.slice(0, 8)}…`);
          } catch (e: any) {
            const msg = String(e?.message ?? e);
            const reason = msg.includes("RoundStillActive")
              ? "another miner beat us to it"
              : "couldn't advance";
            cb.log("info", `↳ ${reason}`);
          }
        }

        cb.onStatus("solving");

        // Kick any idle workers onto the current config.
        for (const slot of slots) {
          if (!slot.busy && !submitting) {
            dispatchTo(slot, cfg);
          }
        }

        // Poll the chain for round changes every few seconds — workers will
        // pick up the new config on their next dispatch automatically.
        await sleep(4000);
      } catch (e: any) {
        if (stopped) break;
        cb.log("err", `loop error: ${truncate(String(e?.message ?? e), 110)}`);
        await sleep(2000);
      }
    }
  })();

  return { stop };
}

type SignatureOutcome =
  | { kind: "confirmed" }
  | { kind: "failed"; reason: string }
  | { kind: "lost" };

/** Poll until the signature confirms, reverts, or we give up. Avoids
 * `confirmTransaction`'s blockhash-window limitation — devnet/Helius can
 * deliver confirmations late, after the blockhash expires, and the standard
 * helper treats that as failure even when the tx actually landed. */
async function waitForSignature(
  connection: Connection,
  sig: string,
  timeoutMs: number
): Promise<SignatureOutcome> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const resp = await connection.getSignatureStatuses([sig], {
        searchTransactionHistory: true,
      });
      const status = resp.value[0];
      if (status) {
        if (status.err) {
          let logs: string[] = [];
          try {
            const tx = await connection.getTransaction(sig, {
              commitment: "confirmed",
              maxSupportedTransactionVersion: 0,
            });
            logs = tx?.meta?.logMessages ?? [];
          } catch {}
          return {
            kind: "failed",
            reason: classifyMineFailure(JSON.stringify(status.err), logs),
          };
        }
        if (
          status.confirmationStatus === "confirmed" ||
          status.confirmationStatus === "finalized"
        ) {
          return { kind: "confirmed" };
        }
      }
    } catch {
      // Transient RPC error — keep polling.
    }
    await sleep(2000);
  }
  return { kind: "lost" };
}

/** Map an on-chain mine failure to a short, user-readable reason. Anchor
 * error codes start at 6000; see `programs/equium/src/errors.rs` for the
 * full enum order. */
function classifyMineFailure(errJson: string, logs: string[]): string {
  const all = errJson + " " + logs.join(" | ");
  if (all.includes("AboveTarget") || all.includes('"Custom":6003') || all.includes("0x1773"))
    return "above target — off-chain check disagreed with on-chain";
  if (all.includes("InvalidEquihash") || all.includes('"Custom":6002') || all.includes("0x1772"))
    return "invalid Equihash solution — solver bug";
  if (all.includes("StaleChallenge") || all.includes('"Custom":6004') || all.includes("0x1774"))
    return "stale challenge — another miner won this round";
  if (all.includes("MiningNotOpen") || all.includes('"Custom":6013') || all.includes("0x177d"))
    return "mining not open yet";
  if (all.includes("SupplyExhausted") || all.includes('"Custom":6006'))
    return "mineable supply exhausted";
  if (all.includes("BlockhashNotFound") || all.includes("blockhash"))
    return "blockhash expired before tx landed";
  if (all.includes("InsufficientFunds") || all.includes("insufficient lamports"))
    return "wallet ran out of SOL for fees";
  return `tx reverted on-chain (${errJson.slice(0, 60)})`;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function buildInputBlock(
  challenge: Uint8Array,
  miner: Uint8Array,
  height: bigint
): Uint8Array {
  const out = new Uint8Array(81);
  out.set(new TextEncoder().encode("Equium-v1"), 0);
  out.set(challenge, 9);
  out.set(miner, 41);
  const heightLe = new Uint8Array(8);
  const dv = new DataView(heightLe.buffer);
  dv.setBigUint64(0, height, true);
  out.set(heightLe, 73);
  return out;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

async function sha256(input: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest("SHA-256", input as any);
  return new Uint8Array(buf);
}

function formatBase(base: bigint): string {
  const whole = base / 1_000_000n;
  const frac = base % 1_000_000n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}
