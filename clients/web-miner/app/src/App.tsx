import { useEffect, useMemo, useRef, useState } from "react";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { fetchConfig, getProgram, type EquiumConfig } from "./program";
import { startMiner, type MinerHandle } from "./miner";

interface LogLine {
  ts: number;
  level: "info" | "ok" | "err";
  msg: string;
}

export function App() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const program = useMemo(
    () => (wallet.publicKey ? getProgram(connection, wallet) : null),
    [connection, wallet.publicKey?.toBase58()]
  );

  const [config, setConfig] = useState<EquiumConfig | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [eqmBalance, setEqmBalance] = useState<bigint | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<"idle" | "solving" | "submitting">(
    "idle"
  );
  const [blocksMinedSession, setBlocksMinedSession] = useState(0);
  const [eqmEarnedSession, setEqmEarnedSession] = useState(0n);
  const [lastSolveMs, setLastSolveMs] = useState<number | null>(null);

  const minerHandle = useRef<MinerHandle | null>(null);
  const logsRef = useRef<HTMLDivElement>(null);

  const log = (level: LogLine["level"], msg: string) => {
    setLogs((prev) => {
      const next = [...prev, { ts: Date.now(), level, msg }];
      return next.slice(-200);
    });
  };

  // Fetch config + balances on connect / periodically while connected.
  useEffect(() => {
    if (!program || !wallet.publicKey) return;
    let cancelled = false;
    const refresh = async () => {
      const cfg = await fetchConfig(program);
      if (cancelled) return;
      setConfig(cfg);
      if (cfg) {
        try {
          const mintAcct = await connection.getAccountInfo(cfg.mint, "confirmed");
          const tokenProgram = mintAcct?.owner;
          if (!tokenProgram) throw new Error("mint not found");
          const ata = getAssociatedTokenAddressSync(
            cfg.mint,
            wallet.publicKey!,
            false,
            tokenProgram
          );
          const acct = await getAccount(connection, ata, "confirmed", tokenProgram);
          if (!cancelled) setEqmBalance(acct.amount);
        } catch {
          if (!cancelled) setEqmBalance(0n);
        }
      }
      try {
        const lamports = await connection.getBalance(wallet.publicKey!);
        if (!cancelled) setSolBalance(lamports / LAMPORTS_PER_SOL);
      } catch {}
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [program, wallet.publicKey?.toBase58(), connection]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs.length]);

  const startMining = () => {
    if (!program || !wallet.publicKey || !wallet.signTransaction) {
      log("err", "wallet not ready");
      return;
    }
    setRunning(true);
    setBlocksMinedSession(0);
    setEqmEarnedSession(0n);
    log("info", `mining as ${shortPubkey(wallet.publicKey.toBase58())}`);
    minerHandle.current = startMiner({
      connection,
      program,
      miner: wallet.publicKey,
      signTransaction: wallet.signTransaction!,
      cb: {
        log,
        onConfig: setConfig,
        onBlockMined: (height) => {
          setBlocksMinedSession((n) => n + 1);
          if (config) {
            setEqmEarnedSession((n) => n + config.currentEpochReward);
          }
          log("ok", `mined block ${height}`);
        },
        onSolveProgress: setProgress,
      },
    });
  };

  const stopMining = () => {
    minerHandle.current?.stop();
    minerHandle.current = null;
    setRunning(false);
    setProgress("idle");
    log("info", "mining stopped");
  };

  // Track solve time from log entries — quick + dirty.
  useEffect(() => {
    const last = logs[logs.length - 1];
    if (!last) return;
    const m = last.msg.match(/solved in (\d+(?:\.\d+)?)ms/);
    if (m) setLastSolveMs(Number(m[1]));
  }, [logs.length]);

  return (
    <div className="container">
      <div className="header">
        <div className="brand">
          <img src="/logo.png" alt="Equium" className="brand-logo" />
          <div className="brand-text">
            Equium
            <span className="ticker">$EQM</span>
          </div>
        </div>
        <WalletMultiButton />
      </div>

      <p className="tagline">
        CPU-mineable Solana token, Bitcoin-style economics. Connect a wallet,
        click Start Mining, earn $EQM. Solving runs in your browser.
      </p>

      <div className="panel">
        <div className="panel-title">Network</div>
        <div className="stat-grid">
          <div className="stat">
            <div className="label">Block height</div>
            <div className="value">
              {config ? config.blockHeight.toString() : "—"}
            </div>
          </div>
          <div className="stat">
            <div className="label">Epoch reward</div>
            <div className="value">
              {config ? formatEqm(config.currentEpochReward) : "—"}
            </div>
          </div>
          <div className="stat">
            <div className="label">Mineable left</div>
            <div className="value">
              {config
                ? formatEqm(MINEABLE_BASE - config.cumulativeMined)
                : "—"}
            </div>
          </div>
          <div className="stat">
            <div className="label">Status</div>
            <div
              className={`value ${
                config?.miningOpen ? "good" : "bad"
              }`}
            >
              {config
                ? config.miningOpen
                  ? "OPEN"
                  : "CLOSED"
                : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Wallet</div>
        {wallet.publicKey ? (
          <div className="stat-grid">
            <div className="stat">
              <div className="label">SOL balance</div>
              <div className="value">
                {solBalance !== null ? solBalance.toFixed(4) : "—"}
              </div>
            </div>
            <div className="stat">
              <div className="label">EQM balance</div>
              <div className="value">
                {eqmBalance !== null ? formatEqm(eqmBalance) : "—"}
              </div>
            </div>
            <div className="stat">
              <div className="label">Earned this session</div>
              <div className="value good">
                +{formatEqm(eqmEarnedSession)}
              </div>
            </div>
            <div className="stat">
              <div className="label">Blocks this session</div>
              <div className="value">{blocksMinedSession}</div>
            </div>
          </div>
        ) : (
          <div className="stat dim">
            Connect a wallet to start.
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-title">Miner</div>
        <div className="row">
          {!running ? (
            <button
              className="button primary"
              disabled={
                !wallet.publicKey || !config?.miningOpen
              }
              onClick={startMining}
            >
              Start mining
            </button>
          ) : (
            <button className="button danger" onClick={stopMining}>
              Stop
            </button>
          )}
          <span className="stat dim">
            {progress === "solving" && "Solving Equihash…"}
            {progress === "submitting" && "Submitting tx…"}
            {progress === "idle" && (running ? "Idle…" : "Stopped")}
            {lastSolveMs !== null && progress === "solving" &&
              ` (last solve ${lastSolveMs.toFixed(0)}ms)`}
          </span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Activity</div>
        <div className="log" ref={logsRef}>
          {logs.length === 0 && (
            <div className="line">No activity yet.</div>
          )}
          {logs.map((l, i) => (
            <div className={`line ${l.level}`} key={i}>
              <span className="ts">
                {new Date(l.ts).toLocaleTimeString()}
              </span>
              {l.msg}
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Protocol</div>
        <div className="kvp">
          <span className="k">Program</span>
          <span className="v">
            {config && wallet.publicKey ? (
              <a
                href={`https://explorer.solana.com/address/${import.meta.env
                  .VITE_PROGRAM_ID || "ZKGMUfxiRCXFPnqz9zgqAnuqJy15jk7fKbR4o6FuEQM"}?cluster=${
                  cluster
                }`}
                target="_blank"
                rel="noreferrer"
              >
                ZKGM…6FuEQM
              </a>
            ) : (
              "ZKGM…6FuEQM"
            )}
          </span>
        </div>
        {config && (
          <>
            <div className="kvp">
              <span className="k">Mint</span>
              <span className="v">{shortPubkey(config.mint.toBase58())}</span>
            </div>
            <div className="kvp">
              <span className="k">PoW</span>
              <span className="v">
                Equihash (n={config.equihashN}, k={config.equihashK})
              </span>
            </div>
            <div className="kvp">
              <span className="k">Current target</span>
              <span className="v">
                0x{toHex(config.currentTarget.slice(0, 4))}…
                {toHex(config.currentTarget.slice(28))}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const MINEABLE_BASE = 18_900_000n * 1_000_000n;

function formatEqm(base: bigint): string {
  const whole = base / 1_000_000n;
  const frac = base % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

function shortPubkey(s: string): string {
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function toHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

const cluster: "mainnet-beta" | "devnet" | "testnet" =
  ((import.meta.env.VITE_CLUSTER as any) || "devnet") as any;
