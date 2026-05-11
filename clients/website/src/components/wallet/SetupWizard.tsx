"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet-context";
import { generateKeypair, exportSecretKeyBase58 } from "@/lib/wallet-crypto";
import { Keypair } from "@solana/web3.js";

type Mode = "choose" | "create-backup" | "create-password" | "import" | "import-password";

export function SetupWizard() {
  const wallet = useWallet();
  const [mode, setMode] = useState<Mode>("choose");
  const [draftKp, setDraftKp] = useState<Keypair | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  const [importInput, setImportInput] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const startCreate = () => {
    setDraftKp(generateKeypair());
    setBackedUp(false);
    setMode("create-backup");
  };

  const doCreate = async () => {
    if (password.length < 8) return alert("password must be 8+ characters");
    if (password !== confirm) return alert("passwords don't match");
    if (!draftKp) return;
    setBusy(true);
    try {
      // Install the exact keypair we just showed the user as backup —
      // can't go through createWithPassword because that generates a new
      // keypair internally.
      await wallet.adoptKeypair(draftKp, password);
    } catch {
      // error surfaced via wallet.error
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    if (password.length < 8) return alert("password must be 8+ characters");
    if (password !== confirm) return alert("passwords don't match");
    setBusy(true);
    try {
      await wallet.importWithPassword(importInput, password);
    } catch {
      // error already set on context
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-panel)] p-8 md:p-10 relative overflow-hidden">
      <div
        className="absolute -inset-10 opacity-20 blur-3xl pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(232,90,141,0.45), transparent 65%)",
        }}
      />

      <div className="relative">
        {mode === "choose" && (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--color-border-bright)] bg-[var(--color-bg-elev)] mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-mint)] live-dot" />
              <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-[var(--color-fg-dim)]">
                Set up your miner
              </span>
            </div>
            <h2 className="text-[36px] md:text-[44px] font-black tracking-[-0.025em] mb-3">
              Create a wallet to mine with.
            </h2>
            <p className="text-[16px] text-[var(--color-fg-dim)] max-w-md mx-auto mb-8">
              We'll generate a fresh Solana keypair right here in your browser.
              Block rewards land in it. The secret never leaves this device.
            </p>

            <div className="grid sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
              <button
                onClick={startCreate}
                className="group rounded-2xl border-2 border-[var(--color-rose)] bg-[var(--color-rose)]/10 p-6 text-left hover:bg-[var(--color-rose)]/20 transition-all"
              >
                <SparkIcon />
                <h3 className="text-[18px] font-bold mb-1 mt-3">
                  Generate new wallet
                </h3>
                <p className="text-[13px] text-[var(--color-fg-dim)]">
                  Fresh keypair, ready in seconds. Recommended for first-time miners.
                </p>
              </button>
              <button
                onClick={() => setMode("import")}
                className="rounded-2xl border border-[var(--color-border-bright)] bg-[var(--color-bg-elev)] p-6 text-left hover:bg-[var(--color-panel-2)] transition-all"
              >
                <KeyIcon />
                <h3 className="text-[18px] font-bold mb-1 mt-3">
                  Import existing key
                </h3>
                <p className="text-[13px] text-[var(--color-fg-dim)]">
                  Paste a Phantom-exported base58 secret or a Solana CLI JSON array.
                </p>
              </button>
            </div>
            <SecurityNote />
          </div>
        )}

        {mode === "create-backup" && draftKp && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-6">
              <h2 className="text-[28px] md:text-[34px] font-black tracking-[-0.02em] mb-2">
                Back up your secret key.
              </h2>
              <p className="text-[15px] text-[var(--color-fg-dim)]">
                Write this down. Save it in your password manager.{" "}
                <span className="text-[var(--color-rose)] font-semibold">
                  If you lose it, your $EQM is gone.
                </span>
              </p>
            </div>

            <KeyReveal kp={draftKp} />

            <label className="flex items-start gap-3 mt-6 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={backedUp}
                onChange={(e) => setBackedUp(e.target.checked)}
                className="mt-1 w-5 h-5 accent-[var(--color-rose)]"
              />
              <span className="text-[14px] text-[var(--color-fg-soft)]">
                I've saved my secret key somewhere safe. I understand that
                Equium can't recover it for me.
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDraftKp(null);
                  setMode("choose");
                }}
                className="px-5 py-3 rounded-full border border-[var(--color-border-bright)] text-[14px] font-medium text-[var(--color-fg-soft)] hover:bg-white/[0.04]"
              >
                ← Back
              </button>
              <button
                disabled={!backedUp}
                onClick={() => setMode("create-password")}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[var(--color-rose)] text-[var(--color-bg)] text-[14px] font-bold hover:bg-[var(--color-rose-bright)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-rose)]"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {mode === "create-password" && (
          <PasswordPanel
            title="Set a password"
            description="Encrypts your key on this device. You'll enter this whenever you re-open the miner."
            password={password}
            confirm={confirm}
            busy={busy}
            error={wallet.error}
            onPasswordChange={(v) => {
              setPassword(v);
              wallet.clearError();
            }}
            onConfirmChange={setConfirm}
            onBack={() => setMode("create-backup")}
            onSubmit={doCreate}
            submitLabel="Create wallet"
          />
        )}

        {mode === "import" && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-6">
              <h2 className="text-[28px] md:text-[34px] font-black tracking-[-0.02em] mb-2">
                Import a secret key.
              </h2>
              <p className="text-[15px] text-[var(--color-fg-dim)]">
                Paste a base58 secret (Phantom export) or a JSON array
                (Solana CLI).
              </p>
            </div>
            <textarea
              value={importInput}
              onChange={(e) => setImportInput(e.target.value)}
              placeholder="Paste secret key here…"
              className="w-full h-24 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border-bright)] px-4 py-3 font-mono text-[13px] text-[var(--color-fg)] resize-none focus:border-[var(--color-rose)] outline-none mb-3"
            />
            {wallet.error && (
              <p className="text-[13px] text-[var(--color-rose)] mb-3">
                {wallet.error}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setMode("choose");
                  setImportInput("");
                  wallet.clearError();
                }}
                className="px-5 py-3 rounded-full border border-[var(--color-border-bright)] text-[14px] font-medium text-[var(--color-fg-soft)] hover:bg-white/[0.04]"
              >
                ← Back
              </button>
              <button
                disabled={!importInput.trim()}
                onClick={() => setMode("import-password")}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[var(--color-rose)] text-[var(--color-bg)] text-[14px] font-bold hover:bg-[var(--color-rose-bright)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-rose)]"
              >
                Continue →
              </button>
            </div>
            <SecurityNote />
          </div>
        )}

        {mode === "import-password" && (
          <PasswordPanel
            title="Set a password"
            description="We'll encrypt the imported key with this password before saving."
            password={password}
            confirm={confirm}
            busy={busy}
            error={wallet.error}
            onPasswordChange={(v) => {
              setPassword(v);
              wallet.clearError();
            }}
            onConfirmChange={setConfirm}
            onBack={() => setMode("import")}
            onSubmit={doImport}
            submitLabel="Import wallet"
          />
        )}
      </div>
    </div>
  );
}

function KeyReveal({ kp }: { kp: Keypair }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const secret = exportSecretKeyBase58(kp);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="rounded-2xl border border-[var(--color-rose-soft)] bg-[var(--color-rose-soft)]/30 p-5">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--color-rose-bright)] mb-2 font-semibold">
        Public key
      </div>
      <div className="font-mono text-[13px] text-[var(--color-teal)] break-all mb-4">
        {kp.publicKey.toBase58()}
      </div>

      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--color-rose-bright)] mb-2 font-semibold">
        Secret key (base58)
      </div>
      <div className="relative">
        <div
          className={`font-mono text-[13px] break-all p-3 rounded-xl border ${
            shown
              ? "bg-[var(--color-bg)] border-[var(--color-border-bright)] text-[var(--color-fg)]"
              : "bg-[var(--color-bg)] border-[var(--color-border)] text-transparent select-none"
          }`}
        >
          {secret}
        </div>
        {!shown && (
          <button
            onClick={() => setShown(true)}
            className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl backdrop-blur-md bg-black/40 text-[14px] font-bold hover:bg-black/30 transition-colors"
          >
            👁  Click to reveal
          </button>
        )}
      </div>
      {shown && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={copy}
            className="flex-1 px-4 py-2 rounded-full border border-[var(--color-border-bright)] text-[12px] font-mono font-semibold hover:bg-white/[0.04]"
          >
            {copied ? "✓ Copied" : "📋 Copy secret key"}
          </button>
          <button
            onClick={() => setShown(false)}
            className="px-4 py-2 rounded-full border border-[var(--color-border-bright)] text-[12px] font-mono font-semibold hover:bg-white/[0.04]"
          >
            Hide
          </button>
        </div>
      )}
    </div>
  );
}

function PasswordPanel({
  title,
  description,
  password,
  confirm,
  busy,
  error,
  onPasswordChange,
  onConfirmChange,
  onBack,
  onSubmit,
  submitLabel,
}: {
  title: string;
  description: string;
  password: string;
  confirm: string;
  busy: boolean;
  error: string | null;
  onPasswordChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <div className="max-w-md mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-[28px] md:text-[34px] font-black tracking-[-0.02em] mb-2">
          {title}
        </h2>
        <p className="text-[14px] text-[var(--color-fg-dim)]">{description}</p>
      </div>
      <div className="space-y-3">
        <input
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="Password (min 8 chars)"
          autoFocus
          className="w-full rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border-bright)] px-4 py-3 text-[15px] text-[var(--color-fg)] focus:border-[var(--color-rose)] outline-none"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
          placeholder="Confirm password"
          className="w-full rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border-bright)] px-4 py-3 text-[15px] text-[var(--color-fg)] focus:border-[var(--color-rose)] outline-none"
        />
      </div>
      {error && (
        <p className="text-[13px] text-[var(--color-rose)] mt-3">{error}</p>
      )}
      <div className="flex gap-3 mt-6">
        <button
          onClick={onBack}
          disabled={busy}
          className="px-5 py-3 rounded-full border border-[var(--color-border-bright)] text-[14px] font-medium text-[var(--color-fg-soft)] hover:bg-white/[0.04] disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          disabled={busy || !password || !confirm}
          onClick={onSubmit}
          className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[var(--color-rose)] text-[var(--color-bg)] text-[14px] font-bold hover:bg-[var(--color-rose-bright)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-rose)]"
        >
          {busy ? "Working…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

function SparkIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-rose)]">
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="m5.6 5.6 2.1 2.1" />
      <path d="m16.3 16.3 2.1 2.1" />
      <path d="m5.6 18.4 2.1-2.1" />
      <path d="m16.3 7.7 2.1-2.1" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-fg-soft)]">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  );
}

function SecurityNote() {
  return (
    <p className="text-[12px] text-[var(--color-fg-faint)] max-w-md mx-auto mt-8 leading-relaxed">
      Your secret key never leaves this browser. We don't run any wallet
      service — losing the key or password means losing access to the funds.
    </p>
  );
}
