/// <reference lib="webworker" />
//
// Web Worker that runs the WASM Equihash solver off the main thread. Vite
// bundles this with `?worker` import. The main thread posts a SolveRequest
// and receives a SolveResponse (or SolveError).

import init, { solve_block } from "equium-wasm";

export interface SolveRequest {
  type: "solve";
  jobId: number;
  n: number;
  k: number;
  challenge: Uint8Array;
  miner: Uint8Array;
  height: bigint;
  maxAttempts: number;
  seed: Uint8Array;
}

export type SolveResponse =
  | {
      type: "solved";
      jobId: number;
      nonce: Uint8Array;
      solnIndices: Uint8Array;
      attempts: number;
      solveMs: number;
    }
  | { type: "no-solution"; jobId: number; attempts: number; solveMs: number }
  | { type: "error"; jobId: number; message: string };

let initialized = false;

self.onmessage = async (ev: MessageEvent<SolveRequest>) => {
  const req = ev.data;
  if (req.type !== "solve") return;

  try {
    if (!initialized) {
      await init();
      initialized = true;
    }
    const t0 = performance.now();
    const result = solve_block(
      req.n,
      req.k,
      req.challenge,
      req.miner,
      req.height,
      req.maxAttempts,
      req.seed
    );
    const solveMs = performance.now() - t0;
    if (!result) {
      const resp: SolveResponse = {
        type: "no-solution",
        jobId: req.jobId,
        attempts: req.maxAttempts,
        solveMs,
      };
      (self as any).postMessage(resp);
      return;
    }
    const resp: SolveResponse = {
      type: "solved",
      jobId: req.jobId,
      nonce: result.nonce,
      solnIndices: result.soln_indices,
      attempts: result.attempts,
      solveMs,
    };
    (self as any).postMessage(resp);
  } catch (e: any) {
    const resp: SolveResponse = {
      type: "error",
      jobId: req.jobId,
      message: String(e?.message ?? e),
    };
    (self as any).postMessage(resp);
  }
};
