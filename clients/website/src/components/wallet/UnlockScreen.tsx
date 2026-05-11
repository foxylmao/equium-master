"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet-context";

export function UnlockScreen() {
  const wallet = useWallet();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);

  const submit = async () => {
    if (!password) return;
    setBusy(true);
    try {
      await wallet.unlock(password);
    } catch {
      // error visible from context
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-panel)] p-8 md:p-10 relative overflow-hidden max-w-md mx-auto">
      <div
        className="absolute -inset-10 opacity-25 blur-3xl pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(232,90,141,0.45), transparent 65%)",
        }}
      />
      <div className="relative">
        <div className="text-center mb-7">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--color-border-bright)] bg-[var(--color-bg-elev)] mb-5">
            <span className="text-[14px]">🔒</span>
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-[var(--color-fg-dim)]">
              Wallet locked
            </span>
          </div>
          <h2 className="text-[28px] md:text-[34px] font-black tracking-[-0.02em] mb-2">
            Welcome back.
          </h2>
          <p className="text-[14px] text-[var(--color-fg-dim)]">
            Mining as{" "}
            <span className="font-mono text-[var(--color-teal)] font-semibold">
              {wallet.stored ? short(wallet.stored.pubkey) : "—"}
            </span>
          </p>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            wallet.clearError();
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Password"
          autoFocus
          className="w-full rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border-bright)] px-4 py-3 text-[15px] text-[var(--color-fg)] focus:border-[var(--color-rose)] outline-none mb-3"
        />
        {wallet.error && (
          <p className="text-[13px] text-[var(--color-rose)] mb-3">
            {wallet.error}
          </p>
        )}
        <button
          disabled={busy || !password}
          onClick={submit}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-full bg-[var(--color-rose)] text-[var(--color-bg)] text-[15px] font-bold hover:bg-[var(--color-rose-bright)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>

        <div className="mt-6 pt-5 border-t border-[var(--color-border)] text-center">
          {!confirmForget ? (
            <button
              onClick={() => setConfirmForget(true)}
              className="text-[12px] text-[var(--color-fg-dim)] hover:text-[var(--color-rose)] transition-colors"
            >
              Forgot password? Remove this wallet
            </button>
          ) : (
            <div className="text-[12px]">
              <p className="text-[var(--color-fg-soft)] mb-2">
                This will <span className="text-[var(--color-rose)] font-bold">permanently delete</span> the stored
                wallet. You'll need your secret key to recover it.
              </p>
              <div className="flex justify-center gap-2 mt-3">
                <button
                  onClick={() => setConfirmForget(false)}
                  className="px-3 py-1.5 rounded-full text-[var(--color-fg-soft)] hover:bg-white/[0.04]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => wallet.forget()}
                  className="px-3 py-1.5 rounded-full bg-[var(--color-rose)] text-[var(--color-bg)] font-semibold"
                >
                  Yes, remove it
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function short(s: string): string {
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
