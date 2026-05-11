import { useEffect, useRef, useState } from "react";
import {
  getProgramState,
  getWalletBalances,
  startMining,
  stopMining,
  minerStatus,
  exportSecret,
  onMinerLog,
  onMinerAttempt,
  onMinerBlock,
  onMinerRound,
  onMinerStatus,
  type Balances,
  type ProgramState,
  type LogEvent,
  type MinerStats,
} from "../lib/api";
import {
  EQM_DECIMALS,
  fmtHashrate,
  fmtUptime,
  formatEqm,
  formatSol,
  shortPk,
} from "../lib/format";
import { copyText } from "../lib/clipboard";
import SendModal from "./SendModal";

type Props = {
  pubkey: string;
  onOpenSettings: () => void;
};

type DashLog = LogEvent & { ts: number };
const MAX_LOGS = 200;

export default function MineDashboard({ pubkey, onOpenSettings }: Props) {
  const [program, setProgram] = useState<ProgramState | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [stats, setStats] = useState<MinerStats | null>(null);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<DashLog[]>([]);
  const [hashrate, setHashrate] = useState(0);
  const [secretVisible, setSecretVisible] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const logBoxRef = useRef<HTMLDivElement>(null);

  const refreshBalances = async () => {
    try {
      const b = await getWalletBalances();
      setBalances(b);
    } catch {}
  };

  // Polled read-only refresh
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [p, b, s] = await Promise.all([
          getProgramState().catch(() => null),
          getWalletBalances().catch(() => null),
          minerStatus().catch(() => null),
        ]);
        if (!alive) return;
        if (p) setProgram(p);
        if (b) setBalances(b);
        if (s) {
          setRunning(s.running);
          setStats(s.stats);
        }
      } catch {}
    };
    tick();
    const id = setInterval(tick, 6000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Event subscriptions
  useEffect(() => {
    const unlistens: Array<() => void> = [];
    onMinerLog((e) => {
      setLogs((prev) => {
        const next = [...prev, { ...e, ts: Date.now() }];
        if (next.length > MAX_LOGS) next.splice(0, next.length - MAX_LOGS);
        return next;
      });
    }).then((u) => unlistens.push(u));
    onMinerAttempt((e) => {
      setHashrate(e.hashrate_hs);
      setStats((s) =>
        s
          ? {
              ...s,
              try_in_round: e.try_in_round,
              cumulative_nonces: e.cumulative_nonces,
            }
          : s
      );
    }).then((u) => unlistens.push(u));
    onMinerBlock((e) => {
      setStats((s) =>
        s
          ? {
              ...s,
              blocks_mined: e.blocks_mined,
              total_earned_base: e.total_earned_base,
              last_log: `mined #${e.height}`,
            }
          : s
      );
      setTimeout(refreshBalances, 1500);
    }).then((u) => unlistens.push(u));
    onMinerRound(() => {}).then((u) => unlistens.push(u));
    onMinerStatus((e) => setRunning(e.running)).then((u) =>
      unlistens.push(u)
    );
    return () => {
      unlistens.forEach((u) => u());
    };
  }, []);

  useEffect(() => {
    const el = logBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  const onStart = async () => {
    try {
      const s = await startMining();
      setRunning(s.running);
      setStats(s.stats);
    } catch (e: any) {
      pushLog(setLogs, "err", String(e));
    }
  };
  const onStop = async () => {
    try {
      const s = await stopMining();
      setRunning(s.running);
      setStats(s.stats);
    } catch (e: any) {
      pushLog(setLogs, "err", String(e));
    }
  };

  const revealSecret = async () => {
    if (secret) {
      setSecretVisible((v) => !v);
      return;
    }
    try {
      const s = await exportSecret();
      setSecret(s);
      setSecretVisible(true);
    } catch (e) {
      console.error(e);
    }
  };

  const insufficientSol = (balances?.sol_lamports ?? 0) < 5_000_000;
  const miningOpen = program?.mining_open ?? false;
  const startedAt = stats?.started_at_unix_ms ?? 0;
  const uptime = running && startedAt > 0 ? Date.now() - startedAt : 0;

  return (
    <div className="stack">
      <Hero
        running={running}
        miningOpen={miningOpen}
        insufficientSol={insufficientSol}
        hashrate={hashrate}
        blocksMined={stats?.blocks_mined ?? 0}
        earnedBase={stats?.total_earned_base ?? 0}
        uptime={uptime}
        onStart={onStart}
        onStop={onStop}
      />

      <div className="grid-2">
        <WalletCard
          pubkey={pubkey}
          balances={balances}
          insufficientSol={insufficientSol}
          secret={secret}
          secretVisible={secretVisible}
          onReveal={revealSecret}
          onSend={() => setSendOpen(true)}
        />
        <NetworkCard program={program} onOpenSettings={onOpenSettings} />
      </div>

      <ActivityCard
        logs={logs}
        logBoxRef={logBoxRef}
        tryInRound={stats?.try_in_round ?? 0}
        cumulativeNonces={stats?.cumulative_nonces ?? 0}
      />

      <SendModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        fromPubkey={pubkey}
        solLamports={balances?.sol_lamports ?? 0}
        eqmBase={balances?.eqm_base ?? 0}
        onSent={refreshBalances}
      />
    </div>
  );
}

function Hero({
  running,
  miningOpen,
  insufficientSol,
  hashrate,
  blocksMined,
  earnedBase,
  uptime,
  onStart,
  onStop,
}: {
  running: boolean;
  miningOpen: boolean;
  insufficientSol: boolean;
  hashrate: number;
  blocksMined: number;
  earnedBase: number;
  uptime: number;
  onStart: () => void;
  onStop: () => void;
}) {
  const statusLabel = running ? "Mining" : miningOpen ? "Ready" : "Network closed";
  const statusDot = running ? "dot-ok dot-pulse" : miningOpen ? "dot-warn" : "dot-bad";

  return (
    <div className="card-hero">
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <span className={`pill ${running ? "pill-ok" : ""} mono`}>
              <span className={`dot ${statusDot}`} />
              {statusLabel}
            </span>
          </div>
          <h1>{running ? "Solving Equihash" : "Ready to mine"}</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: 480, fontSize: 13.5 }}>
            {running
              ? "Your CPU is racing the network. Every solved block credits 25 EQM to this wallet."
              : miningOpen
                ? "Press start. The protocol pays 25 EQM per block to the first valid solution it sees."
                : "The mineable vault hasn't been funded yet — mining will open once admin loads it."}
          </p>
        </div>
        <div style={{ flexShrink: 0 }}>
          {running ? (
            <button className="btn btn-danger btn-lg" onClick={onStop}>
              Stop mining
            </button>
          ) : (
            <button
              className="btn btn-primary btn-lg"
              onClick={onStart}
              disabled={!miningOpen || insufficientSol}
              title={
                !miningOpen
                  ? "Mining not open yet"
                  : insufficientSol
                    ? "Wallet needs SOL for fees"
                    : ""
              }
            >
              Start mining
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: 22,
          paddingTop: 18,
          borderTop: "1px solid var(--line-hair)",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
        }}
      >
        <Stat
          label="Hashrate"
          value={fmtHashrate(hashrate).split(" ")[0]}
          unit={fmtHashrate(hashrate).split(" ")[1] ?? ""}
          sub={`uptime ${fmtUptime(uptime)}`}
        />
        <Stat
          label="Blocks mined"
          value={blocksMined.toString()}
          sub={running ? "session in progress" : "since last start"}
        />
        <Stat
          label="Session earned"
          value={formatEqm(earnedBase, EQM_DECIMALS)}
          unit="EQM"
          sub={`+${formatEqm(25_000_000, 0)} per block`}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div>
        <span className="stat-num">{value}</span>
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function WalletCard({
  pubkey,
  balances,
  insufficientSol,
  secret,
  secretVisible,
  onReveal,
  onSend,
}: {
  pubkey: string;
  balances: Balances | null;
  insufficientSol: boolean;
  secret: string | null;
  secretVisible: boolean;
  onReveal: () => void;
  onSend: () => void;
}) {
  return (
    <div className="card stack">
      <div className="row-between">
        <h3 className="eyebrow">Wallet</h3>
        <CopyBtn text={pubkey} label="Copy" />
      </div>
      <div className="pubkey">{pubkey}</div>

      <div className="divider" />

      <div className="row" style={{ gap: 32 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            SOL
          </div>
          <div className="stat-num" style={{ fontSize: 22 }}>
            {balances ? formatSol(balances.sol_lamports) : "—"}
          </div>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>
            EQM
          </div>
          <div className="stat-num" style={{ fontSize: 22 }}>
            {balances ? formatEqm(balances.eqm_base, EQM_DECIMALS) : "—"}
          </div>
        </div>
      </div>

      {insufficientSol && (
        <div className="alert alert-warn">
          Fund this wallet with a small amount of SOL. ~0.005 SOL covers about
          30 mining attempts.
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary" onClick={onSend}>
          Send
        </button>
        <button className="btn" onClick={onReveal}>
          {secretVisible ? "Hide secret" : "Export secret"}
        </button>
        {secret && secretVisible && <CopyBtn text={secret} label="Copy key" />}
      </div>
      {secret && secretVisible && (
        <div className="secret-box mono">{secret}</div>
      )}
    </div>
  );
}

function NetworkCard({
  program,
  onOpenSettings,
}: {
  program: ProgramState | null;
  onOpenSettings: () => void;
}) {
  if (!program) {
    return (
      <div className="card stack">
        <h3 className="eyebrow">Network</h3>
        <div className="muted">Reading on-chain state…</div>
      </div>
    );
  }
  return (
    <div className="card stack">
      <h3 className="eyebrow">Network</h3>
      <Row
        k="Status"
        v={
          program.mining_open ? (
            <span className="pill pill-ok mono">
              <span className="dot dot-ok" /> live
            </span>
          ) : (
            <span className="pill pill-warn mono">
              <span className="dot dot-warn" /> waiting on vault
            </span>
          )
        }
      />
      <Row k="Block height" v={<span className="mono">{program.block_height.toLocaleString()}</span>} />
      <Row
        k="Reward"
        v={
          <span className="mono">
            {formatEqm(program.epoch_reward, EQM_DECIMALS)}{" "}
            <span className="dim">EQM</span>
          </span>
        }
      />
      <Row
        k="Target prefix"
        v={
          <span className="mono dim" style={{ fontSize: 11.5 }}>
            0x{program.current_target_hex.slice(0, 8)}…
          </span>
        }
      />
      <Row
        k="Equihash"
        v={
          <span className="mono">
            ({program.equihash_n}, {program.equihash_k})
          </span>
        }
      />
      <Row
        k="Mint"
        v={
          <CopyBtn
            text={program.mint}
            label={shortPk(program.mint, 4, 4)}
            inline
          />
        }
      />
      <div className="divider" />
      <button
        className="btn btn-ghost"
        onClick={onOpenSettings}
        style={{ alignSelf: "flex-start", padding: "0 10px" }}
      >
        Plug in your own RPC →
      </button>
    </div>
  );
}

function ActivityCard({
  logs,
  logBoxRef,
  tryInRound,
  cumulativeNonces,
}: {
  logs: DashLog[];
  logBoxRef: React.RefObject<HTMLDivElement | null>;
  tryInRound: number;
  cumulativeNonces: number;
}) {
  return (
    <div className="card stack">
      <div className="row-between">
        <h3 className="eyebrow">Activity</h3>
        <span className="mono dim" style={{ fontSize: 11 }}>
          try {tryInRound} · {cumulativeNonces.toLocaleString()} nonces
        </span>
      </div>
      <div className="log" ref={logBoxRef}>
        {logs.length === 0 && (
          <div className="faint mono" style={{ padding: "12px 0" }}>
            no activity yet — press start to begin mining
          </div>
        )}
        {logs.map((l, i) => (
          <div key={i} className={`log-line log-${l.level}`}>
            <span className="log-time">{fmtTime(l.ts)}</span>
            <span>{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="row-between">
      <span className="muted" style={{ fontSize: 13 }}>
        {k}
      </span>
      <span>{v}</span>
    </div>
  );
}

function CopyBtn({
  text,
  label,
  inline,
}: {
  text: string;
  label: string;
  inline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      className={`copybtn ${copied ? "copied" : ""}`}
      onClick={onClick}
      style={inline ? { fontSize: 11 } : undefined}
    >
      {copied ? "✓ copied" : label}
    </button>
  );
}

function pushLog(
  setLogs: React.Dispatch<React.SetStateAction<DashLog[]>>,
  level: "info" | "ok" | "err",
  message: string
) {
  setLogs((prev) => {
    const next = [...prev, { ts: Date.now(), level, message }];
    if (next.length > MAX_LOGS) next.splice(0, next.length - MAX_LOGS);
    return next;
  });
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
