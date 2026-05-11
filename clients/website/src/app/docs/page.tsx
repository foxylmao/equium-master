import Link from "next/link";
import { DocsLayout } from "@/components/docs/DocsLayout";
import { DocTitle, P } from "@/components/docs/DocsPrimitives";

export const metadata = {
  title: "Documentation",
  description:
    "Technical documentation for Equium: protocol design, tokenomics, mining setup, and RPC configuration.",
};

const CARDS = [
  {
    href: "/docs/getting-started",
    title: "Getting started",
    body: "Set up the browser miner or the desktop app, fund your wallet, and submit your first block.",
  },
  {
    href: "/docs/protocol",
    title: "Protocol",
    body: "How Equihash 96,5, block rounds, retargeting, halving, and the on-chain program fit together.",
  },
  {
    href: "/docs/tokenomics",
    title: "Tokenomics",
    body: "Supply schedule, premine allocation, vault mechanics, and how the cap is enforced on-chain.",
  },
  {
    href: "/docs/rpc",
    title: "RPC setup",
    body: "Plug a free Helius endpoint into the desktop miner so it doesn't share the public rate limit.",
  },
];

export default function DocsIndex() {
  return (
    <DocsLayout>
      <DocTitle
        kicker="Documentation"
        title="Equium documentation"
        lede="Reference material for miners, integrators, and anyone reading the source. The protocol is small and the docs follow that — start with Getting started if you just want to mine."
      />
      <P>
        Equium is a CPU-mineable token on Solana with a fixed 21M supply and a
        Bitcoin-style halving schedule. The on-chain program is roughly 1,000
        lines of Rust and is open source under Apache-2.0. These pages cover
        what each part does and how to interact with it.
      </P>

      <div className="grid sm:grid-cols-2 gap-3 mt-10">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5 hover:border-[var(--color-rose-soft)] transition-colors group"
          >
            <div className="text-[16px] font-bold tracking-[-0.01em] mb-1.5 group-hover:text-[var(--color-rose)] transition-colors">
              {c.title}
            </div>
            <p className="text-[13.5px] leading-[1.55] text-[var(--color-fg-dim)]">
              {c.body}
            </p>
          </Link>
        ))}
      </div>
    </DocsLayout>
  );
}
