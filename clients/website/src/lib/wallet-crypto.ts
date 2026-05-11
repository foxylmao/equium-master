// Password-based encryption for storing the miner's secret key in the browser.
// Uses PBKDF2 to derive a 256-bit AES-GCM key from the user's password, then
// encrypts the 32-byte secret seed. The ciphertext lives in localStorage; the
// plaintext only lives in memory between unlock and sign-out.

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const STORAGE_KEY = "equium:wallet:v1";
const PBKDF2_ITERS = 600_000; // OWASP 2024 recommendation for SHA-256

export interface EncryptedWallet {
  v: 1;
  /** Base58-encoded public key (so we can show it before unlock). */
  pubkey: string;
  /** Base64 PBKDF2 salt (16 bytes). */
  salt: string;
  /** Base64 AES-GCM nonce (12 bytes). */
  iv: string;
  /** Base64 ciphertext of the 32-byte secret seed. */
  ct: string;
  /** Unix timestamp (ms) when this wallet was first created. */
  createdAt: number;
}

export interface LoadedWallet {
  pubkey: string;
  keypair: Keypair;
}

function bytesToB64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password) as any,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: PBKDF2_ITERS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Generate a fresh Solana keypair. */
export function generateKeypair(): Keypair {
  return Keypair.generate();
}

/** Parse a user-supplied private key. Accepts base58 (Phantom export) or
 * JSON array (`solana-keygen` output). Returns a Keypair or throws. */
export function keypairFromUserInput(input: string): Keypair {
  const s = input.trim();
  if (!s) throw new Error("private key is empty");

  // JSON array of 64 bytes (solana CLI format)
  if (s.startsWith("[")) {
    let arr: number[];
    try {
      arr = JSON.parse(s);
    } catch {
      throw new Error("invalid JSON keypair");
    }
    if (!Array.isArray(arr) || arr.length !== 64) {
      throw new Error("expected a 64-byte secret-key array");
    }
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }

  // base58 (most common — Phantom export gives this)
  let decoded: Uint8Array;
  try {
    decoded = bs58.decode(s);
  } catch {
    throw new Error("invalid base58");
  }
  if (decoded.length === 64) return Keypair.fromSecretKey(decoded);
  if (decoded.length === 32) {
    return Keypair.fromSeed(decoded);
  }
  throw new Error(
    `expected 64-byte secret key or 32-byte seed; got ${decoded.length} bytes`
  );
}

/** Encrypt the 32-byte secret seed under a password and persist to localStorage. */
export async function persistWallet(
  keypair: Keypair,
  password: string
): Promise<EncryptedWallet> {
  if (password.length < 6) {
    throw new Error("password must be at least 6 characters");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveKey(password, salt);
  // We store the 32-byte seed (first 32 bytes of the 64-byte secretKey).
  const seed = keypair.secretKey.slice(0, 32);
  const ctBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as any },
    aesKey,
    seed as any
  );
  const wallet: EncryptedWallet = {
    v: 1,
    pubkey: keypair.publicKey.toBase58(),
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ct: bytesToB64(new Uint8Array(ctBuf)),
    createdAt: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
  return wallet;
}

/** Decrypt the seed and return a usable Keypair. Throws on wrong password. */
export async function unlockWallet(
  wallet: EncryptedWallet,
  password: string
): Promise<LoadedWallet> {
  const salt = b64ToBytes(wallet.salt);
  const iv = b64ToBytes(wallet.iv);
  const ct = b64ToBytes(wallet.ct);
  const aesKey = await deriveKey(password, salt);
  let seedBuf: ArrayBuffer;
  try {
    seedBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as any },
      aesKey,
      ct as any
    );
  } catch {
    throw new Error("wrong password");
  }
  const seed = new Uint8Array(seedBuf);
  if (seed.length !== 32) throw new Error("corrupted wallet ciphertext");
  const keypair = Keypair.fromSeed(seed);
  if (keypair.publicKey.toBase58() !== wallet.pubkey) {
    throw new Error("decrypted seed doesn't match stored pubkey");
  }
  return { pubkey: wallet.pubkey, keypair };
}

export function loadStoredWallet(): EncryptedWallet | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const w = JSON.parse(raw);
    if (w && w.v === 1 && typeof w.pubkey === "string" && w.ct && w.iv && w.salt)
      return w as EncryptedWallet;
    return null;
  } catch {
    return null;
  }
}

/** Wipe the stored ciphertext entirely. Cannot be undone. */
export function deleteStoredWallet() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Export the secret key as base58 (Phantom-compatible). Only call after unlock. */
export function exportSecretKeyBase58(keypair: Keypair): string {
  return bs58.encode(keypair.secretKey);
}
