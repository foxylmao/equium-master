/**
 * Shown on /mine and /explorer when the on-chain protocol isn't accepting
 * mine transactions yet. Two distinct states:
 *
 *   "not-initialized"  — `initialize` hasn't been called. Config PDA empty.
 *   "vault-empty"      — `initialize` ran, but `fund_vault` hasn't, so
 *                        `mining_open` is still false.
 */

import Link from "next/link";

type Stage = "not-initialized" | "vault-empty";

export function PreLaunchPanel({ stage }: { stage: Stage }) {
  const copy =
    stage === "not-initialized"
      ? {
          eyebrow: "Pre-launch",
          title: "The protocol is deployed, not yet open.",
          body: (
            <>
              The Equium program is live on Solana mainnet at{" "}
              <code className="font-mono text-[12.5px] text-[var(--color-teal)]">
                ZKGM…uEQM
              </code>{" "}
              and the build is{" "}
              <a
                href="https://verify.osec.io/status/ZKGMUfxiRCXFPnqz9zgqAnuqJy15jk7fKbR4o6FuEQM"
                target="_blank"
                rel="noreferrer noopener"
                className="text-[var(--color-rose)] hover:underline"
              >
                verified
              </a>
              . Mining opens once the deployer initializes the on-chain
              state and funds the mineable vault with the 18.9M supply.
              You'll see live blocks here as soon as the first round opens.
            </>
          ),
        }
      : {
          eyebrow: "Almost open",
          title: "Initialized. Waiting on vault funding.",
          body: (
            <>
              The on-chain config exists but the mineable vault hasn't been
              funded yet, so the program still rejects{" "}
              <code className="font-mono text-[12.5px] text-[var(--color-teal)]">
                mine
              </code>{" "}
              instructions. Mining will open the moment the deployer signs the
              one-shot <code className="font-mono text-[12.5px] text-[var(--color-teal)]">fund_vault</code> transaction.
            </>
          ),
        };

  return (
    <div className="rounded-3xl border border-[var(--color-rose-soft)] bg-[var(--color-rose-soft)]/[0.08] p-6 md:p-8 relative overflow-hidden">
      <div
        className="absolute -top-20 -right-20 w-80 h-80 rounded-full pointer-events-none opacity-20 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(232,90,141,0.5), transparent 60%)",
        }}
      />
      <div className="relative">
        <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-[var(--color-rose)] mb-3 font-semibold flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-gold)]" />
          {copy.eyebrow}
        </div>
        <h2 className="text-[24px] md:text-[30px] font-black tracking-[-0.02em] leading-[1.1] mb-3">
          {copy.title}
        </h2>
        <p className="text-[15px] leading-[1.65] text-[var(--color-fg-dim)] max-w-2xl">
          {copy.body}
        </p>

        <div className="mt-5 flex items-center gap-3 flex-wrap text-[13px]">
          <Link
            href="/docs/protocol"
            className="text-[var(--color-rose)] font-semibold hover:underline"
          >
            How it works →
          </Link>
          <span className="text-[var(--color-fg-faint)]">·</span>
          <a
            href="https://x.com/EquiumEQM"
            target="_blank"
            rel="noreferrer noopener"
            className="text-[var(--color-fg-soft)] hover:text-[var(--color-fg)] hover:underline"
          >
            Follow @EquiumEQM for launch
          </a>
        </div>
      </div>
    </div>
  );
}
