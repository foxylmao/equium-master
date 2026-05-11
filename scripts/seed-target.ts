// Admin-only: seeds the on-chain difficulty target.
//
// The auto-retarget needs ~5 windows / 300 blocks to converge from a
// permissive default to a realistic value. This ix lets the admin shortcut
// that with one tx. Reverts after `renounce_admin`.
//
// Usage:
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//   ANCHOR_WALLET=./AgbSti5...EQM.json \
//   npx ts-node --transpile-only scripts/seed-target.ts [hex-target]
//
// Default target = `0x10` followed by 31 × `0xFF` (~1/15 pass rate, ~7-8 sec
// per block on a fast laptop).

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const IDL_PATH = path.resolve(process.cwd(), "target/idl/equium.json");
const CONFIG_SEED = Buffer.from("equium-config");

function parseTargetArg(arg: string | undefined): Buffer {
  if (!arg) {
    // Default: top byte 0x10, rest 0xFF.
    const t = Buffer.alloc(32, 0xff);
    t[0] = 0x10;
    return t;
  }
  const hex = arg.replace(/^0x/, "");
  if (hex.length !== 64) {
    throw new Error(
      `target must be 32 bytes / 64 hex chars; got ${hex.length}`
    );
  }
  return Buffer.from(hex, "hex");
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const program = new Program(idl, provider) as Program<any>;

  const [configPda] = PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    program.programId
  );

  const target = parseTargetArg(process.argv[2]);
  const cfgBefore: any = await program.account.equiumConfig.fetch(configPda);

  console.log(`current target: 0x${Buffer.from(cfgBefore.currentTarget).toString("hex")}`);
  console.log(`new     target: 0x${target.toString("hex")}`);

  const sig = await program.methods
    .setTarget(Array.from(target))
    .accounts({
      admin: provider.wallet.publicKey,
      config: configPda,
    })
    .rpc();

  console.log(`tx: ${sig}`);

  const cfgAfter: any = await program.account.equiumConfig.fetch(configPda);
  console.log(`confirmed:      0x${Buffer.from(cfgAfter.currentTarget).toString("hex")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
