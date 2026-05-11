import Link from "next/link";
import { DocsLayout } from "@/components/docs/DocsLayout";
import {
  DocTitle,
  H2,
  H3,
  P,
  UL,
  OL,
  Code,
  Pre,
  Callout,
} from "@/components/docs/DocsPrimitives";

export const metadata = {
  title: "Getting started · Equium docs",
  description:
    "Set up the Equium browser miner or desktop app: generate a wallet, fund it with SOL, and start producing blocks.",
};

export default function Page() {
  return (
    <DocsLayout>
      <DocTitle
        kicker="Getting started"
        title="From zero to mining."
        lede="Equium has two reference miners: a browser-based one at equium.xyz/mine and a native desktop app. Both produce identical on-chain transactions; the desktop app is faster because it runs natively."
      />

      <H2 id="prerequisites">Prerequisites</H2>
      <UL>
        <li>A modern CPU with at least 100 MB of free RAM per mining thread.</li>
        <li>
          A small amount of SOL for transaction fees. Each mining attempt is a
          regular Solana transaction; about 0.005 SOL covers ~30 attempts.
        </li>
        <li>
          For the desktop app: macOS 11+, Windows 10/11, or x86_64 Linux. For
          the browser miner: any current Chromium, Firefox, or Safari build.
        </li>
      </UL>

      <H2 id="choose-a-miner">Choose a miner</H2>
      <P>
        Both miners use the same on-chain program, so they are
        interchangeable. The difference is operational:
      </P>
      <UL>
        <li>
          <strong>Browser miner</strong> — visit{" "}
          <Link href="/mine" className="text-[var(--color-rose)] hover:underline">
            equium.xyz/mine
          </Link>
          . The site proxies RPC through its server, so you don't need to
          provide one. WebAssembly runs the solver, parallelized across
          workers. Throughput is roughly 2-3x slower per core than native.
        </li>
        <li>
          <strong>Desktop app</strong> — install from the{" "}
          <Link href="/download" className="text-[var(--color-rose)] hover:underline">
            downloads page
          </Link>
          . Runs natively, hits the chain through your own Helius endpoint, and
          stays online without a browser tab. The wallet is encrypted at rest
          with Argon2id + AES-256-GCM.
        </li>
      </UL>

      <H2 id="create-a-wallet">Create a wallet</H2>
      <P>
        Both miners generate a fresh Solana keypair locally on first run. The
        secret key never leaves your machine. You will be shown the secret
        once during setup so you can back it up — there is no recovery if you
        lose it.
      </P>
      <Callout tone="warn" title="Write down your secret key">
        Equium does not run a custody service. There is no password reset, no
        recovery email, and no support channel that can restore access. The
        backup screen exists for a reason; copy the secret to a password
        manager or paper before continuing.
      </Callout>

      <H3>Importing an existing key</H3>
      <P>
        If you already have a Solana key you'd like to mine with, paste the
        secret on the import screen. Both base58 (Phantom-style) and the
        64-byte JSON array format (Solana CLI's <Code>id.json</Code>) are
        accepted.
      </P>

      <H2 id="fund-your-wallet">Fund your wallet</H2>
      <P>
        Send a small amount of SOL to your generated address. The dashboard
        shows the address with a copy button. The address is a regular Solana
        address, so any wallet works — Phantom, Backpack, a CEX withdrawal,
        or another wallet you already have funds in. Roughly 0.01 SOL covers
        a few hours of mining at the current fee market.
      </P>

      <H2 id="start-mining">Start mining</H2>
      <OL>
        <li>
          Wait for the network panel to show <Code>Mining open: live</Code>.
          During pre-launch periods this may read{" "}
          <Code>waiting on vault</Code> — the protocol vault has to be funded
          by the admin before the first round can open.
        </li>
        <li>
          Press <strong>Start mining</strong>. The dashboard begins streaming
          attempts in the Activity log.
        </li>
        <li>
          Each successful block credits 25 EQM to your wallet directly. You
          can stop and resume at any time.
        </li>
      </OL>

      <H3>Choosing how many CPU cores to use</H3>
      <P>
        The browser miner exposes a cores picker on the dashboard. It defaults
        to one less than your total core count so the OS and browser remain
        responsive. The desktop miner currently uses a single worker thread;
        multi-thread support is on the roadmap.
      </P>

      <H2 id="rpc-considerations">RPC considerations</H2>
      <P>
        The browser miner is served behind a proxied RPC, so casual mining
        works out of the box. The desktop miner uses the default public Solana
        endpoint unless you provide your own — public endpoints are
        rate-limited and slow down considerably under sustained mining load. A
        free Helius key takes five minutes to set up and gives you 100k
        requests per day. See the{" "}
        <Link
          href="/docs/rpc"
          className="text-[var(--color-rose)] hover:underline"
        >
          RPC setup
        </Link>{" "}
        guide.
      </P>

      <H2 id="sending-tokens">Sending tokens</H2>
      <P>
        Both wallets include a Send action that supports SOL and EQM. EQM
        transfers use SPL <Code>transferChecked</Code>, so they work whether
        the mint is classic SPL or Token-2022 — the token program is detected
        at send time. If the recipient has never held EQM, the sender pays a
        small one-time SOL fee (~0.002 SOL) to create their associated token
        account.
      </P>

      <H2 id="exporting-your-key">Exporting your key</H2>
      <P>
        Both apps include an <strong>Export secret</strong> action that
        reveals your wallet's base58 secret key after you click through a
        blur. Use this if you want to move the wallet into Phantom, Backpack,
        or any standard Solana wallet. After export, treat both copies as the
        same key.
      </P>

      <H2 id="next-steps">Next steps</H2>
      <UL>
        <li>
          Read{" "}
          <Link
            href="/docs/protocol"
            className="text-[var(--color-rose)] hover:underline"
          >
            Protocol
          </Link>{" "}
          for how rounds, retargeting, and halving work.
        </li>
        <li>
          Read{" "}
          <Link
            href="/docs/tokenomics"
            className="text-[var(--color-rose)] hover:underline"
          >
            Tokenomics
          </Link>{" "}
          for the full supply schedule and what is or isn't reserved.
        </li>
      </UL>

      <H3>Building from source</H3>
      <P>
        The full miner stack is open source at{" "}
        <a
          href="https://github.com/HannaPrints/equium"
          target="_blank"
          rel="noreferrer noopener"
          className="text-[var(--color-rose)] hover:underline"
        >
          github.com/HannaPrints/equium
        </a>
        . The CLI reference miner is the shortest path to a headless setup:
      </P>
      <Pre>{`git clone https://github.com/HannaPrints/equium
cd equium/clients/cli-miner
cargo build --release
./target/release/equium-miner \\
  --rpc-url https://mainnet.helius-rpc.com/?api-key=YOUR_KEY \\
  --keypair ~/.config/solana/id.json`}</Pre>
    </DocsLayout>
  );
}
