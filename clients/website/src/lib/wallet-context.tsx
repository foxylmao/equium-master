"use client";

import { Keypair, Transaction } from "@solana/web3.js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  EncryptedWallet,
  LoadedWallet,
  deleteStoredWallet,
  exportSecretKeyBase58,
  generateKeypair,
  keypairFromUserInput,
  loadStoredWallet,
  persistWallet,
  unlockWallet,
} from "./wallet-crypto";

interface WalletState {
  /** What screen the wallet UI should show. */
  status: "loading" | "needs-setup" | "needs-unlock" | "unlocked";
  /** Encrypted blob if one exists in localStorage. */
  stored: EncryptedWallet | null;
  /** Decrypted keypair, only present when status==="unlocked". */
  loaded: LoadedWallet | null;
  /** Last error message (used by the UI). */
  error: string | null;
}

interface WalletActions {
  /** Create a fresh keypair, encrypt with password, persist. */
  createWithPassword: (password: string) => Promise<LoadedWallet>;
  /** Install an already-generated keypair (e.g. one the user has just
   * backed up via the setup wizard). Encrypts + persists, transitions to
   * the "unlocked" state. */
  adoptKeypair: (kp: Keypair, password: string) => Promise<LoadedWallet>;
  /** Import a secret key string + encrypt with password. */
  importWithPassword: (secretInput: string, password: string) => Promise<LoadedWallet>;
  /** Decrypt the stored wallet using password. */
  unlock: (password: string) => Promise<LoadedWallet>;
  /** Drop the in-memory keypair (ciphertext stays). */
  lock: () => void;
  /** Wipe the stored ciphertext entirely. */
  forget: () => void;
  /** Get the unlocked secret key (base58) for backup. Returns null if locked. */
  exportSecret: () => string | null;
  /** Sign a Solana transaction with the unlocked keypair. */
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  clearError: () => void;
}

const Ctx = createContext<(WalletState & WalletActions) | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>({
    status: "loading",
    stored: null,
    loaded: null,
    error: null,
  });

  // Initial load
  useEffect(() => {
    const stored = loadStoredWallet();
    if (!stored) {
      setState({
        status: "needs-setup",
        stored: null,
        loaded: null,
        error: null,
      });
    } else {
      setState({
        status: "needs-unlock",
        stored,
        loaded: null,
        error: null,
      });
    }
  }, []);

  const setError = useCallback((msg: string) => {
    setState((s) => ({ ...s, error: msg }));
  }, []);
  const clearError = useCallback(() => {
    setState((s) => (s.error ? { ...s, error: null } : s));
  }, []);

  const installWallet = useCallback(
    async (kp: Keypair, password: string): Promise<LoadedWallet> => {
      const stored = await persistWallet(kp, password);
      const loaded: LoadedWallet = { pubkey: stored.pubkey, keypair: kp };
      setState({
        status: "unlocked",
        stored,
        loaded,
        error: null,
      });
      return loaded;
    },
    []
  );

  const createWithPassword = useCallback(
    async (password: string) => {
      try {
        const kp = generateKeypair();
        return await installWallet(kp, password);
      } catch (e: any) {
        setError(String(e?.message ?? e));
        throw e;
      }
    },
    [installWallet, setError]
  );

  const adoptKeypair = useCallback(
    async (kp: Keypair, password: string) => {
      try {
        return await installWallet(kp, password);
      } catch (e: any) {
        setError(String(e?.message ?? e));
        throw e;
      }
    },
    [installWallet, setError]
  );

  const importWithPassword = useCallback(
    async (secretInput: string, password: string) => {
      try {
        const kp = keypairFromUserInput(secretInput);
        return await installWallet(kp, password);
      } catch (e: any) {
        setError(String(e?.message ?? e));
        throw e;
      }
    },
    [installWallet, setError]
  );

  const unlock = useCallback(
    async (password: string) => {
      if (!state.stored) {
        throw new Error("no wallet to unlock");
      }
      try {
        const loaded = await unlockWallet(state.stored, password);
        setState((s) => ({
          ...s,
          status: "unlocked",
          loaded,
          error: null,
        }));
        return loaded;
      } catch (e: any) {
        setError(String(e?.message ?? e));
        throw e;
      }
    },
    [state.stored, setError]
  );

  const lock = useCallback(() => {
    setState((s) =>
      s.stored
        ? { ...s, status: "needs-unlock", loaded: null, error: null }
        : s
    );
  }, []);

  const forget = useCallback(() => {
    deleteStoredWallet();
    setState({
      status: "needs-setup",
      stored: null,
      loaded: null,
      error: null,
    });
  }, []);

  const exportSecret = useCallback((): string | null => {
    if (!state.loaded) return null;
    return exportSecretKeyBase58(state.loaded.keypair);
  }, [state.loaded]);

  const signTransaction = useCallback(
    async (tx: Transaction): Promise<Transaction> => {
      if (!state.loaded) throw new Error("wallet is locked");
      tx.partialSign(state.loaded.keypair);
      return tx;
    },
    [state.loaded]
  );

  const value = useMemo(
    () => ({
      ...state,
      createWithPassword,
      adoptKeypair,
      importWithPassword,
      unlock,
      lock,
      forget,
      exportSecret,
      signTransaction,
      clearError,
    }),
    [
      state,
      createWithPassword,
      adoptKeypair,
      importWithPassword,
      unlock,
      lock,
      forget,
      exportSecret,
      signTransaction,
      clearError,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be inside <WalletProvider>");
  return ctx;
}
