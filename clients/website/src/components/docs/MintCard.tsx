"use client";

import { useState } from "react";

export function MintCard({ mint }: { mint: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div className="rounded-2xl border border-[var(--color-rose-soft)] bg-[var(--color-rose-soft)]/[0.08] p-5 mb-6">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--color-rose)] mb-2 font-semibold">
        EQM Mint · Solana mainnet
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="font-mono text-[14px] md:text-[15px] text-[var(--color-fg)] break-all flex-1 min-w-0">
          {mint}
        </div>
        <button
          onClick={copy}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-mono font-semibold border transition-colors ${
            copied
              ? "border-[var(--color-mint)] text-[var(--color-mint)] bg-[var(--color-mint)]/10"
              : "border-[var(--color-border-bright)] text-[var(--color-fg-soft)] hover:bg-white/[0.04]"
          }`}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
        <a
          href={`https://solscan.io/token/${mint}`}
          target="_blank"
          rel="noreferrer noopener"
          className="flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-mono font-semibold border border-[var(--color-border-bright)] text-[var(--color-fg-soft)] hover:bg-white/[0.04]"
        >
          Solscan ↗
        </a>
      </div>
    </div>
  );
}
