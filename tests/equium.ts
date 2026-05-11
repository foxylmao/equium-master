import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  ComputeBudgetProgram,
  Keypair,
  SYSVAR_SLOT_HASHES_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  getMint,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";

// Tests run against Token-2022. The on-chain program accepts either via
// TokenInterface; we standardize on Token-2022 for new deployments.
const TOKEN_PROGRAM_ID = TOKEN_2022_PROGRAM_ID;
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { expect } from "chai";

const IDL_PATH = path.resolve(process.cwd(), "target/idl/equium.json");
const SOLVER_BIN = path.resolve(
  process.cwd(),
  "target/release/examples/solve_block"
);

const CONFIG_SEED = Buffer.from("equium-config");
const VAULT_SEED = Buffer.from("equium-vault");
const N = 96;
const K = 5;
const TOKEN_DECIMALS = 6;
const TOTAL_SUPPLY = BigInt(21_000_000) * BigInt(1_000_000);
const PREMINE = BigInt(2_100_000) * BigInt(1_000_000);
const MINEABLE = TOTAL_SUPPLY - PREMINE;
const INITIAL_REWARD = BigInt(25) * BigInt(1_000_000);
const ALL_FF_TARGET = Buffer.alloc(32, 0xff);

function hexToBytes(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}
function bytesToHex(b: Buffer | Uint8Array | number[]): string {
  return Buffer.from(b).toString("hex");
}

interface SolveResponse {
  nonce_hex: string;
  soln_indices_hex: string;
  attempts: number;
}

function solveBlock(opts: {
  challenge: Buffer;
  miner: PublicKey;
  height: number;
  target: Buffer;
}): SolveResponse {
  const req = {
    n: N,
    k: K,
    challenge_hex: bytesToHex(opts.challenge),
    miner_hex: bytesToHex(opts.miner.toBytes()),
    height: opts.height,
    target_hex: bytesToHex(opts.target),
  };
  const res = spawnSync(SOLVER_BIN, [], {
    input: JSON.stringify(req),
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 8,
  });
  if (res.status !== 0) {
    throw new Error(`solver failed: status=${res.status} stderr=${res.stderr}`);
  }
  return JSON.parse(res.stdout.trim());
}

describe("equium pre-mint architecture", () => {
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

  const mintKp = Keypair.generate();
  const adminAta = getAssociatedTokenAddressSync(
    mintKp.publicKey,
    provider.wallet.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });

  // Step 0 (off-platform): admin pre-mints 21M to their own ATA. The program
  // never sees this part — it's pure SPL Token, exactly what a deployer would
  // do via solana CLI before deploying.
  it("admin pre-mints 21M off-platform", async () => {
    const rentLamports = await getMinimumBalanceForRentExemptMint(connection);
    const tx = new Transaction()
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
    await provider.sendAndConfirm(tx, [mintKp]);

    const adminAcct = await getAccount(connection, adminAta, undefined, TOKEN_PROGRAM_ID);
    expect(adminAcct.amount.toString()).to.equal(TOTAL_SUPPLY.toString());

    const mintInfo = await getMint(connection, mintKp.publicKey, undefined, TOKEN_PROGRAM_ID);
    expect(mintInfo.decimals).to.equal(TOKEN_DECIMALS);
    expect(mintInfo.supply.toString()).to.equal(TOTAL_SUPPLY.toString());
    // mint authority is still the admin — they'll revoke it themselves
    // off-platform when they're ready to lock the cap.
    expect(mintInfo.mintAuthority?.toBase58()).to.equal(
      provider.wallet.publicKey.toBase58()
    );
  });

  it("initialize: sets up config + empty vault, references existing mint", async () => {
    await program.methods
      .initialize({
        initialTarget: Array.from(ALL_FF_TARGET),
        equihashN: N,
        equihashK: K,
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
      .preInstructions([cuIx])
      .rpc();

    const cfg = await program.account.equiumConfig.fetch(configPda);
    expect(cfg.equihashN).to.equal(N);
    expect(cfg.equihashK).to.equal(K);
    expect(cfg.blockHeight.toNumber()).to.equal(0);
    expect(cfg.mint.toBase58()).to.equal(mintKp.publicKey.toBase58());
    expect(cfg.mineableVault.toBase58()).to.equal(vaultPda.toBase58());
    expect(cfg.miningOpen).to.equal(false);

    const vaultAcct = await getAccount(connection, vaultPda, undefined, TOKEN_PROGRAM_ID);
    expect(vaultAcct.amount.toString()).to.equal("0");
    expect(vaultAcct.owner.toBase58()).to.equal(configPda.toBase58());
  });

  it("mine: reverts before fund_vault is called", async () => {
    let threw = false;
    try {
      await program.methods
        .mine(Array.from(Buffer.alloc(32, 0)), Buffer.alloc(68, 0))
        .accounts({
          miner: provider.wallet.publicKey,
          config: configPda,
          mint: mintKp.publicKey,
          mineableVault: vaultPda,
          minerAta: adminAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
        })
        .preInstructions([cuIx])
        .rpc();
    } catch (err: any) {
      threw = true;
      expect(err.toString()).to.match(/MiningNotOpen|mining has not yet been opened/);
    }
    expect(threw).to.be.true;
  });

  it("fund_vault: transfers 18.9M and opens mining", async () => {
    const adminBefore = await getAccount(connection, adminAta, undefined, TOKEN_PROGRAM_ID);

    await program.methods
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

    const adminAfter = await getAccount(connection, adminAta, undefined, TOKEN_PROGRAM_ID);
    const vaultAfter = await getAccount(connection, vaultPda, undefined, TOKEN_PROGRAM_ID);
    const cfg = await program.account.equiumConfig.fetch(configPda);

    expect(
      (BigInt(adminBefore.amount.toString()) - BigInt(adminAfter.amount.toString())).toString()
    ).to.equal(MINEABLE.toString());
    expect(vaultAfter.amount.toString()).to.equal(MINEABLE.toString());
    expect(adminAfter.amount.toString()).to.equal(PREMINE.toString());
    expect(cfg.miningOpen).to.equal(true);
  });

  it("fund_vault: reverts on second call", async () => {
    let threw = false;
    try {
      await program.methods
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
    } catch (err: any) {
      threw = true;
      expect(err.toString()).to.match(/AlreadyOpen|mining is already open/);
    }
    expect(threw, "fund_vault must be one-shot").to.be.true;
  });

  it("mine: pays the block reward into the miner's ATA", async () => {
    const cfgBefore = await program.account.equiumConfig.fetch(configPda);
    const challenge = Buffer.from(cfgBefore.currentChallenge);
    const heightBefore = cfgBefore.blockHeight.toNumber();
    const reward = BigInt(cfgBefore.currentEpochReward.toString());

    const sol = solveBlock({
      challenge,
      miner: provider.wallet.publicKey,
      height: heightBefore,
      target: ALL_FF_TARGET,
    });

    const adminBefore = await getAccount(connection, adminAta, undefined, TOKEN_PROGRAM_ID);
    const vaultBefore = await getAccount(connection, vaultPda, undefined, TOKEN_PROGRAM_ID);

    await program.methods
      .mine(
        Array.from(hexToBytes(sol.nonce_hex)),
        hexToBytes(sol.soln_indices_hex)
      )
      .accounts({
        miner: provider.wallet.publicKey,
        config: configPda,
        mint: mintKp.publicKey,
        mineableVault: vaultPda,
        minerAta: adminAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
      })
      .preInstructions([cuIx])
      .rpc({ skipPreflight: true });

    const cfgAfter = await program.account.equiumConfig.fetch(configPda);
    const adminAfter = await getAccount(connection, adminAta, undefined, TOKEN_PROGRAM_ID);
    const vaultAfter = await getAccount(connection, vaultPda, undefined, TOKEN_PROGRAM_ID);

    expect(cfgAfter.blockHeight.toNumber()).to.equal(heightBefore + 1);
    expect(cfgAfter.cumulativeMined.toString()).to.equal(reward.toString());
    expect(
      (BigInt(adminAfter.amount.toString()) - BigInt(adminBefore.amount.toString())).toString()
    ).to.equal(reward.toString());
    expect(
      (BigInt(vaultBefore.amount.toString()) - BigInt(vaultAfter.amount.toString())).toString()
    ).to.equal(reward.toString());
  });

  it("mine: rejects a copyist (different miner pubkey)", async () => {
    const cfg = await program.account.equiumConfig.fetch(configPda);
    const challenge = Buffer.from(cfg.currentChallenge);
    const heightBefore = cfg.blockHeight.toNumber();

    const sol = solveBlock({
      challenge,
      miner: provider.wallet.publicKey,
      height: heightBefore,
      target: ALL_FF_TARGET,
    });

    const copyist = Keypair.generate();
    const sig = await connection.requestAirdrop(copyist.publicKey, 1_000_000_000);
    await connection.confirmTransaction(sig);
    const copyistAta = getAssociatedTokenAddressSync(
      mintKp.publicKey,
      copyist.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    let threw = false;
    try {
      await program.methods
        .mine(
          Array.from(hexToBytes(sol.nonce_hex)),
          hexToBytes(sol.soln_indices_hex)
        )
        .accounts({
          miner: copyist.publicKey,
          config: configPda,
          mint: mintKp.publicKey,
          mineableVault: vaultPda,
          minerAta: copyistAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
        })
        .preInstructions([cuIx])
        .signers([copyist])
        .rpc({ skipPreflight: true });
    } catch (err: any) {
      threw = true;
      // Either the on-chain InvalidEquihash error or a client-side error
      // from Anchor failing to decode the simulation logs (Token-2022's
      // error path differs from classic SPL); the point is the tx didn't
      // succeed.
    }
    expect(threw, "copyist submission must be rejected").to.be.true;
    const cfgAfter = await program.account.equiumConfig.fetch(configPda);
    expect(cfgAfter.blockHeight.toNumber()).to.equal(heightBefore);
  });
});
