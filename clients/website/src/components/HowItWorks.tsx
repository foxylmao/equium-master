export function HowItWorks() {
  return (
    <section id="how" className="relative py-28 px-6">
      <div className="max-w-5xl mx-auto">
        <SectionHeader
          kicker="How it works"
          title="Proof-of-work on Solana."
          sub="Equihash 96,5 is memory-bound rather than compute-bound. GPU farms have no meaningful edge over a CPU, so anyone with a machine can compete on roughly equal footing."
        />

        <div className="mt-16 grid md:grid-cols-3 gap-4">
          <StepCard
            num="01"
            title="Generate"
            body="Your machine hashes random nonces against the current network challenge. Each nonce is an independent attempt at the puzzle."
          />
          <StepCard
            num="02"
            title="Solve"
            body="When a nonce produces a hash that falls under the difficulty target, you have an Equihash solution. The puzzle is bound to your wallet address, so the solution cannot be front-run."
            highlight
          />
          <StepCard
            num="03"
            title="Earn"
            body="Submit the solution as a Solana transaction. The on-chain program verifies it and transfers 25 EQM to your wallet. Rounds close roughly every minute."
          />
        </div>

        {/* Difficulty + halving callout */}
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          <InfoCallout
            kicker="Difficulty"
            title="Retargets every hour."
            body="Every 60 blocks the protocol compares elapsed time to the 60-minute target and adjusts the difficulty within a [0.5x, 2x] clamp. The convention follows Bitcoin's retarget, with tighter damping suited to the shorter window."
          />
          <InfoCallout
            kicker="Emission"
            title="Block reward halves every ~8.6 months."
            body="The reward starts at 25 EQM per block and halves at fixed intervals: 12.5, 6.25, and so on. The emission curve mirrors Bitcoin, mapped to roughly one-minute blocks, so 99% of supply is produced within the first decade."
          />
        </div>
      </div>
    </section>
  );
}

function StepCard({
  num,
  title,
  body,
  highlight = false,
}: {
  num: string;
  title: string;
  body: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`relative rounded-3xl p-7 border transition-colors ${
        highlight
          ? "bg-[var(--color-panel-2)] border-[var(--color-rose-soft)]"
          : "bg-[var(--color-panel)] border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
      }`}
    >
      {highlight && (
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none opacity-30"
          style={{
            background:
              "radial-gradient(circle at top right, rgba(232,90,141,0.18), transparent 50%)",
          }}
        />
      )}
      <div className="relative">
        <div className="flex items-center justify-between mb-5">
          <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-[var(--color-fg-dim)]">
            {num}
          </span>
          {highlight && (
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--color-rose)] px-2 py-0.5 rounded-full border border-[var(--color-rose-soft)] bg-[var(--color-rose-soft)]/40">
              the work
            </span>
          )}
        </div>
        <h3 className="text-[26px] font-bold tracking-[-0.02em] mb-2.5">
          {title}
        </h3>
        <p className="text-[15px] leading-[1.6] text-[var(--color-fg-dim)]">
          {body}
        </p>
      </div>
    </div>
  );
}

function InfoCallout({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-3xl p-7 border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--color-rose)] mb-3 font-semibold">
        {kicker}
      </div>
      <h4 className="text-[22px] font-bold tracking-[-0.02em] mb-2.5">
        {title}
      </h4>
      <p className="text-[14px] leading-[1.65] text-[var(--color-fg-dim)]">
        {body}
      </p>
    </div>
  );
}

export function SectionHeader({
  kicker,
  title,
  sub,
}: {
  kicker: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="max-w-3xl">
      <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-[var(--color-rose)] mb-4 font-semibold">
        {kicker}
      </div>
      <h2 className="text-[36px] md:text-[48px] font-black tracking-[-0.025em] leading-[1.05] text-balance mb-5">
        {title}
      </h2>
      {sub && (
        <p className="text-[17px] md:text-[19px] leading-[1.55] text-[var(--color-fg-dim)] text-balance">
          {sub}
        </p>
      )}
    </div>
  );
}
