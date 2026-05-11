import { DocsLayout } from "@/components/docs/DocsLayout";
import {
  DocTitle,
  H2,
  H3,
  P,
  UL,
  Code,
  Callout,
  Table,
} from "@/components/docs/DocsPrimitives";
import { MAINNET_MINT } from "@/lib/constants";
import { MintCard } from "@/components/docs/MintCard";

export const metadata = {
  title: "Tokenomics · Equium docs",
  description:
    "Equium's supply schedule, premine allocation, halving curve, and how the 21M cap is enforced on-chain.",
};

export default function Page() {
  return (
    <DocsLayout>
      <DocTitle
        kicker="Tokenomics"
        title="Supply, schedule, and structure."
        lede="Equium has a fixed 21,000,000 token supply, split 10/90 between a premine and the mineable pool. The mineable portion is released via a Bitcoin-style halving curve. The cap is enforced at the SPL Token level by revoking mint authority before launch."
      />

      <H2 id="mint-address">Mint address</H2>
      <P>
        The official EQM token mint on Solana mainnet is below. Verify this
        before buying on any DEX — anyone can create a token called &quot;EQM&quot;
        and a mismatched address is the most reliable way to spot a fake.
      </P>
      <MintCard mint={MAINNET_MINT} />
      <Callout tone="info" title="Verify before buying">
        Anyone can deploy a token called &quot;EQM&quot; on Solana. The address
        above is the only mint that ever participates in this program. Always
        check the mint address (not just the ticker) before swapping on any
        DEX.
      </Callout>

      <H2 id="supply-breakdown">Supply breakdown</H2>
      <Table
        columns={["Allocation", "Amount", "Share", "Purpose"]}
        rows={[
          ["Mineable pool", "18,900,000 EQM", "90%", "Distributed via proof-of-work, 25 EQM per block, halving every 378k blocks."],
          ["Premine", "2,100,000 EQM", "10%", "Reserved for DEX liquidity provisioning and operational expenses. No founder allocation, no team vesting."],
        ]}
      />

      <H2 id="halving-curve">Halving curve</H2>
      <P>
        Every <Code>378,000</Code> blocks the per-block reward halves. At the
        protocol's one-minute target block time, that's roughly one halving
        every 8.6 months. The first ten eras account for over 99% of the
        total mineable supply.
      </P>
      <Table
        columns={["Era", "Reward", "Era supply", "Cumulative"]}
        rows={[
          ["1", "25.00 EQM", "9,450,000", "9,450,000"],
          ["2", "12.50 EQM", "4,725,000", "14,175,000"],
          ["3", "6.25 EQM", "2,362,500", "16,537,500"],
          ["4", "3.125 EQM", "1,181,250", "17,718,750"],
          ["5", "1.5625 EQM", "590,625", "18,309,375"],
          ["6", "0.78 EQM", "295,313", "18,604,688"],
          ["…", "…", "…", "→ 18,900,000"],
        ]}
      />
      <P>
        Because the schedule is geometric, the protocol never quite reaches
        the cap; in practice it gets arbitrarily close, and the final dust
        rounds to zero once the per-block reward drops below one base unit.
      </P>

      <H2 id="cap-enforcement">How the cap is enforced</H2>
      <P>
        Three independent properties combine to make the supply ceiling
        structural rather than a promise:
      </P>
      <UL>
        <li>
          <strong>Pre-minted supply.</strong> The entire 21,000,000 supply is
          minted off-chain by the deployer before the public launch and
          deposited into the program-controlled mineable vault. The program
          itself never mints new tokens.
        </li>
        <li>
          <strong>Vault-bound transfers.</strong> The on-chain program can
          only move tokens out of its vault, not produce new ones. Once the
          vault is drained, no further EQM exists.
        </li>
        <li>
          <strong>Revoked mint authority.</strong> Before launch, mint
          authority on the SPL Token is set to <Code>None</Code>. This is
          enforced by the Solana runtime — no Solana account, including
          Equium's own program, can mint additional tokens after that point.
        </li>
      </UL>

      <H3>Empty rounds reduce float</H3>
      <P>
        If a round closes without a winning solution (rare, but possible
        during low-hashrate periods), its 25-EQM reward stays in the vault
        permanently. The vault balance never recovers; the rest of the
        schedule continues from where it left off. So real circulating
        supply tracks slightly below the theoretical maximum.
      </P>

      <H2 id="vault-mechanics">Vault mechanics</H2>
      <P>
        The mineable vault is a program-derived token account at{" "}
        <Code>find_program_address([&quot;equium-vault&quot;])</Code>. The
        program owns it; no external signature can move tokens from it
        outside of the protocol's <Code>mine</Code> instruction.
      </P>
      <P>
        At launch, the deployer calls <Code>fund_vault</Code> exactly once to
        transfer the 18,900,000 mineable supply into this account. The
        instruction includes a one-shot guard: it cannot be called a second
        time, and the value transferred is checked against the configured
        mineable amount. After <Code>fund_vault</Code>, the program flips a
        flag on the config and mining opens.
      </P>

      <H2 id="market-mechanics">Market mechanics</H2>
      <P>
        Equium is not designed to be a yield product. The economic model is
        deliberately simple:
      </P>
      <UL>
        <li>
          <strong>Supply schedule is fixed.</strong> 25 EQM enters the
          mineable supply each block (in expectation), halving over time.
          Nothing on the protocol side dynamically responds to market
          conditions.
        </li>
        <li>
          <strong>Demand drives price.</strong> Whatever EQM is worth in SOL
          terms is decided on open markets. The protocol takes no fee, runs
          no treasury, and burns nothing.
        </li>
        <li>
          <strong>Mining cost floor.</strong> Each block costs roughly the SOL
          fee of a Solana transaction plus the electricity of solving
          Equihash. That floor is well below current Solana fee market levels
          and is essentially negligible in dollar terms.
        </li>
      </UL>

      <H2 id="comparison">Comparison with Bitcoin</H2>
      <P>
        The emission curve is deliberately a scaled Bitcoin: same halving
        cadence in halvings-per-supply terms, faster in wall-clock terms
        because Solana blocks are roughly an order of magnitude faster. The
        21,000,000 number is also a direct copy. The differences:
      </P>
      <UL>
        <li>
          PoW is Equihash 96,5 (memory-hard, CPU-friendly), not SHA-256
          (compute-hard, ASIC-dominated). The goal is to keep mining
          accessible to commodity hardware.
        </li>
        <li>
          Settlement is on Solana, so transaction fees are sub-cent rather
          than dollar-range.
        </li>
        <li>
          There is a 10% premine for liquidity, where Bitcoin had none. The
          founders did not allocate themselves any tokens; the premine is
          for DEX pools.
        </li>
      </UL>
    </DocsLayout>
  );
}
