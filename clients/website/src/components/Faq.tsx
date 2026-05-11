"use client";

import { useState } from "react";
import { SectionHeader } from "./HowItWorks";

const ITEMS = [
  {
    q: "Will I make money mining EQM?",
    a: "Maybe, maybe not. Equium is an experiment in fair-launch distribution rather than a yield product. The protocol issues 25 EQM per block to whoever submits the first valid solution, but the market value of those tokens is determined by demand on the open market and is not guaranteed.",
  },
  {
    q: "What if my computer is slow?",
    a: "It will mine, just slower. The network adjusts difficulty so blocks arrive at roughly the same cadence regardless of total hashrate, but the share of those blocks you win scales with your CPU. A modest machine still earns a proportional amount — less than a workstation, but the math is the same.",
  },
  {
    q: "Can someone steal my solution?",
    a: "No. Each Equihash solution is bound to the wallet address that submits it, because the puzzle input includes the miner's pubkey. Replaying a captured solution from a different wallet produces a different puzzle and fails on-chain verification.",
  },
  {
    q: "Why Solana?",
    a: "Transaction costs and finality. A mine transaction costs a fraction of a cent, which keeps the economics viable even at the lowest block rewards. Equivalent protocols on higher-fee chains would cost more in gas than the reward is worth. Sub-second block finality also means winners are confirmed quickly.",
  },
  {
    q: "Is the supply really capped at 21M?",
    a: "Yes. Mint authority is revoked at the SPL Token level before the public launch. After that, no additional EQM can ever be created by anyone — the cap is enforced by the runtime, not by promises in protocol code.",
  },
  {
    q: "Where is the source code?",
    a: "The full protocol, miners, and website are open source under Apache-2.0 at github.com/HannaPrints/equium. The on-chain program is roughly 1,000 lines of Rust. You can audit it, fork it, or run your own miner against it.",
  },
  {
    q: "When does mainnet launch?",
    a: "Mainnet is live. The program is deployed at ZKGMUfxiRCXFPnqz9zgqAnuqJy15jk7fKbR4o6FuEQM and the EQM mint is 1MhvZzEe8gQ8Rb9CrT3Dn26Gkn9QRErzLMGkkTwveqm. Follow @EquiumEQM for protocol updates.",
  },
];

export function Faq() {
  return (
    <section className="relative py-28 px-6">
      <div className="max-w-3xl mx-auto">
        <SectionHeader
          kicker="FAQ"
          title="Common questions."
        />

        <div className="mt-12 space-y-2">
          {ITEMS.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} defaultOpen={i === 0} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqItem({
  q,
  a,
  defaultOpen = false,
}: {
  q: string;
  a: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] overflow-hidden transition-colors hover:border-[var(--color-border-bright)]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="text-[16px] font-semibold tracking-[-0.005em]">
          {q}
        </span>
        <span
          className={`flex-shrink-0 w-7 h-7 rounded-full border border-[var(--color-border-bright)] flex items-center justify-center transition-transform duration-300 ${
            open ? "rotate-180 bg-[var(--color-rose)] border-[var(--color-rose)]" : ""
          }`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      <div
        className="grid transition-all duration-300"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p className="px-6 pb-6 text-[15px] leading-[1.65] text-[var(--color-fg-dim)]">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}
