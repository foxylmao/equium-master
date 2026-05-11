import { DocsLayout } from "@/components/docs/DocsLayout";
import {
  DocTitle,
  H2,
  H3,
  P,
  UL,
  Code,
  Pre,
  Callout,
  Table,
} from "@/components/docs/DocsPrimitives";

export const metadata = {
  title: "Protocol · Equium docs",
  description:
    "Equium's proof-of-work protocol: Equihash 96,5, block rounds, difficulty retargeting, halving, and the on-chain program.",
};

export default function Page() {
  return (
    <DocsLayout>
      <DocTitle
        kicker="Protocol"
        title="How the chain works."
        lede="Equium is a single Solana program that runs a proof-of-work round every minute or so. Miners race to find an Equihash 96,5 solution whose hash falls under the current difficulty target. The first valid solution closes the round and mints 25 EQM to the winner."
      />

      <H2 id="round-lifecycle">Round lifecycle</H2>
      <P>
        Each round is identified by a monotonically increasing{" "}
        <Code>block_height</Code>. When a round opens, the protocol records a
        challenge (32 bytes) derived from the previous round's challenge, the
        last winner's pubkey, and the slot hash at the open slot. Miners take
        that challenge plus their own pubkey and the block height as the input
        to Equihash, then search nonces until they find a valid solution
        whose SHA-256 falls under the current target.
      </P>
      <P>
        The first miner to land a valid <Code>mine</Code> transaction in the
        round wins it. The program verifies the Equihash solution, checks the
        hash against the target, transfers the reward from the program vault
        to the winner's associated token account, and opens the next round.
      </P>

      <H3>Empty rounds</H3>
      <P>
        If no valid solution is submitted in a reasonable window, anyone can
        call <Code>advance_empty_round</Code> to close the round without a
        winner. The reward for that round stays in the vault and is never
        minted. Empty rounds permanently reduce circulating supply below the
        21M cap.
      </P>

      <H2 id="equihash">Equihash 96,5</H2>
      <P>
        Equihash is a memory-hard proof-of-work designed by Biryukov and
        Khovratovich. The <Code>(n, k)</Code> parameters are tunable; we use
        <Code> (96, 5)</Code> because it solves quickly on commodity CPUs
        (~50 MB working set, sub-second per attempt) while remaining hostile
        to GPU/ASIC speedups.
      </P>
      <P>
        Each attempt asks the miner to find <Code>2^(k+1) = 64</Code> indices
        into a Blake2b-derived hash table that satisfy a tree of XOR
        cancellations. Verifying a solution is roughly <Code>O(k · 2^k)</Code>
        — fast enough to fit comfortably inside Solana's compute budget.
      </P>
      <Callout title="Why memory-hard?" tone="info">
        Memory-bound PoW resists ASIC and GPU optimization because the
        bottleneck is RAM bandwidth, not arithmetic throughput. A 32-core
        workstation has a measurable but linear advantage over a laptop; a
        $40k GPU farm does not have an exponential one.
      </Callout>

      <H3>I-block layout</H3>
      <P>
        The 81-byte input to Equihash (called the I-block) is constructed
        deterministically from the round state and the miner's pubkey:
      </P>
      <Pre>{`offset  len  field
0       9    b"Equium-v1"           personalization
9       32   current_challenge      from EquiumConfig
41      32   miner_pubkey
73      8    block_height (LE u64)`}</Pre>
      <P>
        The Wagner search loop hashes <Code>I-block || nonce</Code> into the
        initial Blake2b state per attempt. Including the miner's pubkey in the
        input is what makes solutions non-transferable: a captured solution
        replayed by a different wallet produces a different I-block and fails
        verification.
      </P>

      <H2 id="target-and-retarget">Target &amp; retargeting</H2>
      <P>
        The current target is a 32-byte big-endian unsigned integer stored in{" "}
        <Code>EquiumConfig.current_target</Code>. A solution wins if{" "}
        <Code>sha256(soln_indices || I-block) &lt; target</Code> when both are
        interpreted as 256-bit big-endian numbers. Lower target means harder.
      </P>
      <P>
        Every 60 blocks the protocol retargets. It compares the actual
        elapsed time since the last retarget against the target window
        (3,600 seconds, since 60 blocks at 60 seconds each is one hour) and
        scales the target:
      </P>
      <Pre>{`new_target = old_target * actual_seconds / target_seconds`}</Pre>
      <P>
        The ratio is clamped to <Code>[0.5x, 2x]</Code> per retarget — the
        same convention Bitcoin uses, with damping tuned for the smaller
        60-block window. This keeps difficulty responsive to real hashrate
        changes without overshooting in either direction.
      </P>

      <H2 id="emission">Emission schedule</H2>
      <P>
        Block reward starts at 25 EQM per block and halves every 378,000
        blocks. At a one-minute target, that's roughly one halving every 8.6
        months. The first four eras:
      </P>
      <Table
        columns={["Era", "Reward / block", "Approx. start", "Cumulative supply"]}
        rows={[
          [<Code key="e1">Era 1</Code>, "25 EQM", "Genesis", "0 → 9,450,000"],
          [<Code key="e2">Era 2</Code>, "12.5 EQM", "~Month 9", "9,450,000 → 14,175,000"],
          [<Code key="e3">Era 3</Code>, "6.25 EQM", "~Year 1.7", "14,175,000 → 16,537,500"],
          [<Code key="e4">Era 4</Code>, "3.125 EQM", "~Year 2.6", "16,537,500 → 17,718,750"],
        ]}
      />
      <P>
        Roughly 99% of the mineable supply is produced within the first
        decade. The schedule asymptotes toward — but never reaches — the
        21,000,000 cap. The premine is 10% (2.1M); the mineable portion is
        18.9M.
      </P>

      <H2 id="on-chain-accounts">On-chain accounts</H2>
      <P>
        The program manages two PDAs and a config-defined mint:
      </P>
      <Table
        columns={["PDA", "Seeds", "Purpose"]}
        rows={[
          [
            <Code key="config">EquiumConfig</Code>,
            <Code key="cs">[&quot;equium-config&quot;]</Code>,
            "Round state, target, equihash params, halving counters, last winner.",
          ],
          [
            <Code key="vault">Mineable vault</Code>,
            <Code key="vs">[&quot;equium-vault&quot;]</Code>,
            "Program-owned token account that custodies the 18.9M mineable supply. Funded once at launch via fund_vault.",
          ],
        ]}
      />
      <P>
        The mint itself is pre-created off-chain by the deployer and
        referenced by the config. This separation means the program never
        needs mint authority — it only moves tokens out of the vault — which
        keeps the cap enforcement at the SPL Token level regardless of
        program upgrades.
      </P>

      <H2 id="instructions">Instructions</H2>
      <Table
        columns={["Name", "Caller", "Effect"]}
        rows={[
          [<Code key="init">initialize</Code>, "Admin (once)", "Creates the config PDA with the given Equihash params and initial target."],
          [<Code key="fund">fund_vault</Code>, "Admin (once)", "Transfers the mineable supply into the vault PDA. Opens mining."],
          [<Code key="mine">mine</Code>, "Anyone", "Submits a nonce + solution. On success, transfers reward to caller, advances height, and derives the next challenge."],
          [<Code key="aer">advance_empty_round</Code>, "Anyone", "Closes a stalled round without minting. Caller pays the tx fee."],
          [<Code key="rt">retarget</Code>, "Anyone", "Triggers difficulty adjustment if the 60-block window has elapsed."],
          [<Code key="rev">renounce_admin</Code>, "Admin (once)", "Permanently drops admin powers. Called at launch."],
        ]}
      />

      <H2 id="security">Security properties</H2>
      <UL>
        <li>
          <strong>Front-running resistance.</strong> Solutions are bound to
          the miner's pubkey via the I-block. A mempool observer cannot
          replay a winning nonce from their own wallet.
        </li>
        <li>
          <strong>Cap immutability.</strong> Mint authority is revoked before
          the public launch. The protocol can only move tokens out of its
          vault, never create new ones.
        </li>
        <li>
          <strong>Round atomicity.</strong> Each round opens, mints once, and
          closes within a single Solana transaction. There is no multi-step
          state that can desync.
        </li>
        <li>
          <strong>No admin backdoors after launch.</strong> Once{" "}
          <Code>renounce_admin</Code> runs, no further privileged operations
          are possible — including parameter changes.
        </li>
      </UL>
    </DocsLayout>
  );
}
