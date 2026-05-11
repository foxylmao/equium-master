import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, ComputeBudgetProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// Resolve paths relative to the package root (cwd when invoked via `npm test`
// or directly from the verify-bench/ dir).
const IDL_PATH = path.resolve(process.cwd(), "target/idl/verify_bench.json");
const SOLN_PATH = path.resolve(process.cwd(), "tests/bench-solution.json");

interface BenchSolution {
  n: number;
  k: number;
  input_hex: string;
  nonce_hex: string;
  soln_indices_hex: string;
  target_hex: string;
  soln_len: number;
  input_len: number;
}

function hexToBytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    out.push(parseInt(hex.substr(i, 2), 16));
  }
  return out;
}

describe("verify-bench M0 CU benchmark", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const program = new Program(idl, provider) as Program<any>;

  it("measures Equihash verify CU", async () => {
    const bench: BenchSolution = JSON.parse(fs.readFileSync(SOLN_PATH, "utf-8"));
    console.log(
      `\nLoaded bench solution: n=${bench.n} k=${bench.k} ` +
        `soln=${bench.soln_len}B input=${bench.input_len}B`
    );

    const inputArr = hexToBytes(bench.input_hex);
    const nonceArr = hexToBytes(bench.nonce_hex);
    const solnArr = hexToBytes(bench.soln_indices_hex);
    const targetArr = hexToBytes(bench.target_hex);

    // Pad input to its expected fixed length (challenge::I_LEN = 81).
    if (inputArr.length !== 81) {
      throw new Error(`unexpected input length ${inputArr.length}`);
    }
    if (nonceArr.length !== 32 || targetArr.length !== 32) {
      throw new Error("nonce/target must be 32 bytes");
    }

    // Bump CU limit for the verify ix — default 200k won't fit any equihash verify.
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });

    const tx = await program.methods
      .verify(
        bench.n,
        bench.k,
        Array.from(inputArr),
        Array.from(nonceArr),
        Buffer.from(solnArr),
        Array.from(targetArr)
      )
      .accounts({ payer: provider.wallet.publicKey })
      .preInstructions([cuIx])
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    console.log(`  tx: ${tx}`);

    // Pull logs and consumed-CU.
    const txInfo = await provider.connection.getTransaction(tx, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!txInfo) throw new Error("tx not found");

    const logs = txInfo.meta?.logMessages ?? [];
    console.log("\n--- program logs ---");
    for (const l of logs) console.log("  " + l);

    // Parse the two `Program consumption: X units remaining` lines that
    // bracket the verify call. Diff = verify CU cost.
    const remaining: number[] = [];
    for (const l of logs) {
      const m = l.match(/Program consumption: (\d+) units remaining/);
      if (m) remaining.push(parseInt(m[1], 10));
    }
    if (remaining.length < 2) {
      throw new Error(
        `expected ≥2 'units remaining' log lines, got ${remaining.length}`
      );
    }
    const verifyCu = remaining[0] - remaining[1];

    const totalCu = txInfo.meta?.computeUnitsConsumed ?? 0;
    console.log(
      `\n=== M0 RESULT ===\n` +
        `  Equihash params: n=${bench.n}, k=${bench.k}\n` +
        `  verify-only CU:  ${verifyCu.toLocaleString()}\n` +
        `  full-tx CU:      ${totalCu.toLocaleString()}\n` +
        `  budget headroom: ${(1_400_000 - verifyCu).toLocaleString()} CU\n` +
        `=================\n`
    );

    // Decision tree from plan §M0:
    //   ≤ 1.1M CU at our chosen (n, k)  → GO, lock these params
    //   1.1M–1.3M                       → tight; profile internals before locking
    //   > 1.3M                          → NO-GO, pivot to DrillX/Equix
    if (verifyCu > 1_300_000) {
      console.warn(
        `M0 NO-GO at (${bench.n},${bench.k}) — verify CU exceeds 1.3M; pivot to DrillX/Equix.`
      );
    } else if (verifyCu > 1_100_000) {
      console.warn(
        `M0 TIGHT at (${bench.n},${bench.k}) — between 1.1M and 1.3M; profile before locking.`
      );
    } else {
      console.log(
        `M0 GO at (${bench.n},${bench.k}) — verify CU comfortably under 1.1M.`
      );
    }
  });
});
