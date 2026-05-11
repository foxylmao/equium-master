import Link from "next/link";
import { DocsLayout } from "@/components/docs/DocsLayout";
import {
  DocTitle,
  H2,
  P,
  OL,
  Code,
  Pre,
  Callout,
} from "@/components/docs/DocsPrimitives";

export const metadata = {
  title: "RPC setup · Equium docs",
  description:
    "How to plug a free Helius RPC endpoint into the Equium desktop miner.",
};

export default function Page() {
  return (
    <DocsLayout>
      <DocTitle
        kicker="RPC setup"
        title="Plug in your RPC."
        lede="The Equium desktop miner needs a Solana RPC endpoint to read on-chain state and submit mining transactions. The default public endpoint is heavily rate-limited; a free Helius key gives you 100,000 requests per day, which is more than enough for a single miner running around the clock."
      />

      <Callout tone="info" title="Mining in the browser?">
        You don't need to do this. The website proxies RPC on the server, so
        the browser miner works without configuration. This page is for the
        native desktop app.
      </Callout>

      <H2 id="steps">Setup</H2>
      <OL>
        <li>
          Sign up at{" "}
          <a
            href="https://www.helius.dev/"
            target="_blank"
            rel="noreferrer noopener"
            className="text-[var(--color-rose)] hover:underline"
          >
            helius.dev
          </a>{" "}
          using the free tier. No credit card is required.
        </li>
        <li>
          In the Helius dashboard, open <Code>Endpoints</Code> and either use
          the default project key or click <Code>Create new</Code>. Select
          Mainnet and copy the full URL.
        </li>
        <li>
          Open the Equium Miner desktop app, click <Code>Settings</Code> in
          the top-right, paste the URL into <strong>Custom RPC URL</strong>,
          and save. The URL is stored locally in the app's data folder and is
          never transmitted anywhere other than Helius.
        </li>
      </OL>

      <P>The URL will look like:</P>
      <Pre>{`https://mainnet.helius-rpc.com/?api-key=YOUR-KEY-HERE`}</Pre>

      <H2 id="why">Why doesn't the website need this?</H2>
      <P>
        equium.xyz fronts a server-side RPC proxy with per-IP rate limits.
        That's affordable for the relatively small amount of traffic a casual
        browser miner generates. The desktop miner mines harder and more
        consistently, and that level of sustained throughput would saturate
        the free public endpoints. Bring-your-own-RPC keeps the cost
        attribution clean: heavy miners pay for their own infrastructure.
      </P>

      <H2 id="alternatives">Alternatives to Helius</H2>
      <P>
        Any Solana RPC endpoint that accepts JSON-RPC over HTTPS works.
        Common alternatives include Triton, QuickNode, and Alchemy's Solana
        offering. Self-hosting a validator node also works, though the
        operational cost is well above the mining reward.
      </P>

      <Callout title="Need the desktop app?">
        <Link href="/download" className="text-[var(--color-rose)] hover:underline">
          Grab the installer
        </Link>{" "}
        for macOS, Windows, or Linux. The wallet is generated locally and
        encrypted with Argon2id + AES-256-GCM.
      </Callout>
    </DocsLayout>
  );
}
