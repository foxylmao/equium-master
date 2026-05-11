// Display helpers — base units in/out of EQM, SOL lamports, pubkeys, etc.

export const EQM_DECIMALS = 6;
export const SOL_LAMPORTS_PER_SOL = 1_000_000_000;

export function formatEqm(base: number | bigint, fixed?: number): string {
  const b = typeof base === "bigint" ? base : BigInt(base);
  const whole = b / 1_000_000n;
  const frac = b % 1_000_000n;
  if (fixed !== undefined) {
    const fracPadded = frac.toString().padStart(6, "0").slice(0, fixed);
    return `${whole}${fixed > 0 ? "." + fracPadded : ""}`;
  }
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")}`;
}

export function formatSol(lamports: number, fixed = 4): string {
  return (lamports / SOL_LAMPORTS_PER_SOL).toFixed(fixed);
}

export function shortPk(pk: string, head = 4, tail = 4): string {
  if (pk.length <= head + tail + 1) return pk;
  return `${pk.slice(0, head)}…${pk.slice(-tail)}`;
}

export function shortSig(sig: string): string {
  return shortPk(sig, 6, 6);
}

export function fmtHashrate(hs: number): string {
  if (hs >= 1000) return `${(hs / 1000).toFixed(1)} kH/s`;
  return `${hs.toFixed(1)} H/s`;
}

export function fmtUptime(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
