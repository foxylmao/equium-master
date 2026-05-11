import { ImageResponse } from "next/og";
import { fetchState, fetchLeaderboard } from "@/lib/rpc";

export const runtime = "nodejs";
export const revalidate = 60;
export const alt = "Equium Explorer — live blocks and miners";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraph() {
  const [state, leaderboard] = await Promise.all([
    fetchState().catch(() => null),
    fetchLeaderboard(200, 3).catch(() => []),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#08090c",
          color: "#f1ede6",
          display: "flex",
          flexDirection: "column",
          padding: 64,
          fontFamily: "Inter",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -240,
            left: -200,
            width: 760,
            height: 760,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(125,211,252,0.28) 0%, transparent 60%)",
            display: "flex",
          }}
        />

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 14,
                background: "#13171f",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                fontWeight: 900,
              }}
            >
              E
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 28, fontWeight: 900 }}>Equium</div>
              <div
                style={{
                  fontSize: 13,
                  color: "#e85a8d",
                  letterSpacing: "0.18em",
                  fontWeight: 700,
                  marginTop: 2,
                }}
              >
                $EQM · EXPLORER
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 18px",
              borderRadius: 999,
              border: "1px solid #232a36",
              background: "rgba(17,20,26,0.6)",
              fontSize: 13,
              color: "#8b8478",
              letterSpacing: "0.18em",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: "#6ee7b7",
              }}
            />
            <span>Live · Mainnet</span>
          </div>
        </div>

        {/* Block height hero */}
        <div style={{ marginTop: 36, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 13,
              color: "#7dd3fc",
              letterSpacing: "0.24em",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            — Block height —
          </div>
          <div
            style={{
              fontSize: 160,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              marginTop: 4,
              display: "flex",
            }}
          >
            #{state?.blockHeight ?? "—"}
          </div>
        </div>

        {/* Top miners ticker */}
        <div
          style={{
            marginTop: 24,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#8b8478",
              letterSpacing: "0.22em",
              fontWeight: 700,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Top miners
          </div>
          {leaderboard.slice(0, 3).map((entry, i) => (
            <div
              key={entry.miner}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                fontSize: 22,
                fontFamily: "Inter",
              }}
            >
              <span
                style={{
                  color:
                    i === 0
                      ? "#facc15"
                      : i === 1
                        ? "#f1ede6"
                        : "#e85a8d",
                  fontWeight: 800,
                  width: 40,
                }}
              >
                #{i + 1}
              </span>
              <span style={{ color: "#7dd3fc", fontWeight: 600 }}>
                {short(entry.miner)}
              </span>
              <span style={{ color: "#8b8478" }}>·</span>
              <span style={{ color: "#e85a8d", fontWeight: 700 }}>
                {entry.blocks} blocks
              </span>
            </div>
          ))}
          {leaderboard.length === 0 && (
            <div style={{ color: "#8b8478", fontSize: 18, display: "flex" }}>
              No miners yet. Be the first.
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: 28 }}>
            <Stat
              label="Mined"
              value={state ? formatMined(state.cumulativeMined) : "—"}
              color="#e85a8d"
            />
            <Stat
              label="Empty rounds"
              value={state ? state.emptyRounds.toString() : "—"}
              color="#facc15"
            />
          </div>
          <div
            style={{
              fontSize: 18,
              color: "#e85a8d",
              fontWeight: 700,
            }}
          >
            equium.xyz/explorer
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.2em",
          color: "#8b8478",
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function short(s: string): string {
  return `${s.slice(0, 5)}…${s.slice(-5)}`;
}

function formatMined(base: number): string {
  const eqm = base / 1_000_000;
  if (eqm < 1000) return `${eqm.toFixed(0)} EQM`;
  if (eqm < 1_000_000) return `${(eqm / 1000).toFixed(1)}k EQM`;
  return `${(eqm / 1_000_000).toFixed(2)}M EQM`;
}
