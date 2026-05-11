// One-shot localnet bootstrap matching the production launch flow:
//   1. Pre-mint 21M EQM to the deployer's ATA (off-platform; pure SPL Token)
//   2. Call `initialize` (creates config PDA + empty vault PDA token account)
//   3. Call `fund_vault` (transfers 18.9M into the vault, opens mining)
//
// Usage:
//   ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
//   ANCHOR_WALLET=~/.config/solana/id.json \
//   npx ts-node --transpile-only scripts/init-localnet.ts
//
// REUSE_MINT=1 reuses an existing mint keypair from target/mint-keypair.json.

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";

// Token program the local-net mint is created under. Mainnet will use the
// same path (Token-2022). The on-chain program accepts either via the
// TokenInterface, but we standardize on Token-2022 for new deployments.
const TOKEN_PROGRAM_ID = TOKEN_2022_PROGRAM_ID;
import * as fs from "fs";
import * as path from "path";

const IDL_PATH = path.resolve(process.cwd(), "target/idl/equium.json");
const CONFIG_SEED = Buffer.from("equium-config");
const VAULT_SEED = Buffer.from("equium-vault");
const TOKEN_DECIMALS = 6;
const TOTAL_SUPPLY = BigInt(21_000_000) * BigInt(1_000_000);

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const program = new Program(idl, provider) as Program<any>;

  const [configPda] = PublicKey.findProgramAddressSync(
    [CONFIG_SEED],
    program.programId
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [VAULT_SEED],
    program.programId
  );

  const mintPath = path.resolve(process.cwd(), "target/mint-keypair.json");
  let mintKp: Keypair;
  if (process.env.REUSE_MINT === "1" && fs.existsSync(mintPath)) {
    mintKp = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(mintPath, "utf-8")))
    );
  } else {
    mintKp = Keypair.generate();
    fs.writeFileSync(mintPath, JSON.stringify(Array.from(mintKp.secretKey)));
  }

  const adminAta = getAssociatedTokenAddressSync(
    mintKp.publicKey,
    provider.wallet.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  // Step 1: pre-mint 21M to admin's ATA (off-platform — exactly what a real
  // deployer would do via solana CLI before deploying the program).
  const rentLamports = await getMinimumBalanceForRentExemptMint(connection);
  const premintTx = new Transaction()
    .add(
      SystemProgram.createAccount({
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: mintKp.publicKey,
        space: MINT_SIZE,
        lamports: rentLamports,
        programId: TOKEN_PROGRAM_ID,
      })
    )
    .add(
      createInitializeMintInstruction(
        mintKp.publicKey,
        TOKEN_DECIMALS,
        provider.wallet.publicKey,
        provider.wallet.publicKey,
        TOKEN_PROGRAM_ID
      )
    )
    .add(
      createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey,
        adminAta,
        provider.wallet.publicKey,
        mintKp.publicKey,
        TOKEN_PROGRAM_ID
      )
    )
    .add(
      createMintToInstruction(
        mintKp.publicKey,
        adminAta,
        provider.wallet.publicKey,
        TOTAL_SUPPLY,
        [],
        TOKEN_PROGRAM_ID
      )
    );
  const premintSig = await provider.sendAndConfirm(premintTx, [mintKp]);
  console.log(`pre-mint: 21M EQM minted to ${adminAta.toBase58()}`);
  console.log(`  sig: ${premintSig}`);

  // Step 2: initialize the program.
  const initSig = await program.methods
    .initialize({
      initialTarget: Array.from(Buffer.alloc(32, 0xff)),
      equihashN: 96,
      equihashK: 5,
      metadataUri: "https://equium.example/v1.json",
    })
    .accounts({
      admin: provider.wallet.publicKey,
      config: configPda,
      mint: mintKp.publicKey,
      mineableVault: vaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();
  console.log(`initialize: ${initSig}`);

  // Step 3: fund the vault and open mining.
  const fundSig = await program.methods
    .fundVault()
    .accounts({
      admin: provider.wallet.publicKey,
      config: configPda,
      mint: mintKp.publicKey,
      source: adminAta,
      mineableVault: vaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log(`fund_vault: ${fundSig}`);

  console.log(`\nlaunch summary:`);
  console.log(`  program:   ${program.programId.toBase58()}`);
  console.log(`  admin:     ${provider.wallet.publicKey.toBase58()}`);
  console.log(`  config:    ${configPda.toBase58()}`);
  console.log(`  mint:      ${mintKp.publicKey.toBase58()}`);
  console.log(`  admin ATA: ${adminAta.toBase58()}  (holds 2.1M premine)`);
  console.log(`  vault:     ${vaultPda.toBase58()}  (holds 18.9M mineable)`);
  console.log(`  mining_open: true — miners can now submit`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
