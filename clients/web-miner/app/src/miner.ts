// Mining state machine: orchestrates a Web Worker solver loop, fetches the
// config, builds + signs + sends the mine tx, retries on AboveTarget.

import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import {
  buildMineTx,
  detectTokenProgram,
  fetchConfig,
  EquiumConfig,
  hashUnderTarget,
} from "./program";
import type { SolveRequest, SolveResponse } from "./solver.worker";
import SolverWorker from "./solver.worker?worker";

export interface MinerCallbacks {
  log: (level: "info" | "ok" | "err", msg: string) => void;
  onConfig: (cfg: EquiumConfig) => void;
  onBlockMined: (height: bigint, sig: string) => void;
  onSolveProgress?: (status: "solving" | "submitting" | "idle") => void;
}

export interface MinerHandle {
  stop: () => void;
}

interface SignTxFn {
  (tx: Transaction): Promise<Transaction>;
}

export function startMiner(opts: {
  connection: Connection;
  program: Program<any>;
  miner: PublicKey;
  signTransaction: SignTxFn;
  cb: MinerCallbacks;
}): MinerHandle {
  const { connection, program, miner, signTransaction, cb } = opts;

  let stopped = false;
  let worker: Worker | null = null;
  let nextJobId = 1;
  let tokenProgramCache: PublicKey | null = null;

  const stop = () => {
    stopped = true;
    if (worker) {
      worker.terminate();
      worker = null;
    }
    cb.onSolveProgress?.("idle");
  };

  const solveOnWorker = (req: Omit<SolveRequest, "type" | "jobId">) =>
    new Promise<SolveResponse>((resolve, reject) => {
      if (!worker) worker = new SolverWorker();
      const w = worker;
      const jobId = nextJobId++;
      const handler = (ev: MessageEvent<SolveResponse>) => {
        if (ev.data.jobId !== jobId) return;
        w.removeEventListener("message", handler);
        resolve(ev.data);
      };
      w.addEventListener("message", handler);
      w.addEventListener(
        "error",
        (e) => reject(new Error(e.message)),
        { once: true }
      );
      const msg: SolveRequest = { type: "solve", jobId, ...req };
      w.postMessage(msg);
    });

  (async () => {
    while (!stopped) {
      try {
        const cfg = await fetchConfig(program);
        if (!cfg) {
          cb.log("err", "config PDA not found — is the program initialized?");
          await sleep(3000);
          continue;
        }
        cb.onConfig(cfg);
        if (!cfg.miningOpen) {
          cb.log(
            "err",
            "mining is not open — admin needs to call fund_vault first"
          );
          await sleep(5000);
          continue;
        }

        cb.onSolveProgress?.("solving");
        const seed = new Uint8Array(32);
        crypto.getRandomValues(seed);
        const t0 = performance.now();
        const resp = await solveOnWorker({
          n: cfg.equihashN,
          k: cfg.equihashK,
          challenge: cfg.currentChallenge,
          miner: miner.toBytes(),
          height: cfg.blockHeight,
          maxAttempts: 4096,
          seed,
        });

        if (resp.type === "error") {
          cb.log("err", `solver error: ${resp.message}`);
          await sleep(1000);
          continue;
        }
        if (resp.type === "no-solution") {
          cb.log(
            "err",
            `solver gave up after ${resp.attempts} nonces (${resp.solveMs.toFixed(0)}ms); refreshing`
          );
          continue;
        }
        cb.log(
          "info",
          `solved in ${resp.solveMs.toFixed(0)}ms (${resp.attempts} nonce${resp.attempts === 1 ? "" : "s"}), submitting…`
        );

        // Off-chain target check — saves an RPC roundtrip if the candidate
        // wouldn't pass on-chain.
        const inputBlock = buildInputBlock(
          cfg.currentChallenge,
          miner.toBytes(),
          cfg.blockHeight
        );
        const candidateHash = await sha256(
          concatBytes(resp.solnIndices, inputBlock)
        );
        if (!hashUnderTarget(candidateHash, cfg.currentTarget)) {
          cb.log("info", "candidate above target; retrying");
          continue;
        }

        cb.onSolveProgress?.("submitting");
        try {
          if (!tokenProgramCache) {
            tokenProgramCache = await detectTokenProgram(connection, cfg.mint);
          }
          const tx = await buildMineTx({
            program,
            miner,
            mint: cfg.mint,
            tokenProgram: tokenProgramCache,
            nonce: resp.nonce,
            solnIndices: resp.solnIndices,
          });
          const recent = await connection.getLatestBlockhash("confirmed");
          tx.recentBlockhash = recent.blockhash;
          tx.feePayer = miner;
          const signed = await signTransaction(tx);
          const sig = await connection.sendRawTransaction(signed.serialize(), {
            skipPreflight: true,
          });
          await connection.confirmTransaction(
            { signature: sig, ...recent },
            "confirmed"
          );
          cb.onBlockMined(cfg.blockHeight, sig);
          cb.log("ok", `block ${cfg.blockHeight} confirmed (${sig.slice(0, 8)}…)`);
        } catch (e: any) {
          cb.log("err", `submit failed: ${trimErr(e)}`);
          await sleep(500);
          continue;
        }

        const elapsed = performance.now() - t0;
        cb.log("info", `total round latency: ${elapsed.toFixed(0)}ms`);
        cb.onSolveProgress?.("solving");
      } catch (e: any) {
        cb.log("err", `loop error: ${trimErr(e)}`);
        await sleep(2000);
      }
    }
  })();

  return { stop };
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function trimErr(e: any): string {
  const s = String(e?.message ?? e);
  return s.length > 220 ? s.slice(0, 220) + "…" : s;
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
  const buf = await crypto.subtle.digest("SHA-256", input);
  return new Uint8Array(buf);
}
