import { ImageResponse } from "next/og";
import { fetchState } from "@/lib/rpc";

export const runtime = "nodejs";
// Regenerate every 60s so chain state (block height) stays current in
// Twitter/Discord embeds without forcing a redeploy after each round.
export const revalidate = 60;
export const alt = "Equium — CPU-mineable Solana token";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraph() {
  // Pull a live datapoint so the OG image refreshes when re-fetched
  const state = await fetchState().catch(() => null);

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
        {/* Glow */}
        <div
          style={{
            position: "absolute",
            top: -220,
            left: -180,
            width: 760,
            height: 760,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(232,90,141,0.42) 0%, transparent 60%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -240,
            right: -160,
            width: 640,
            height: 640,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(250,204,21,0.18) 0%, transparent 60%)",
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
                color: "#f1ede6",
                fontSize: 30,
                fontWeight: 900,
              }}
            >
              E
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 30, fontWeight: 900 }}>Equium</div>
              <div
                style={{
                  fontSize: 14,
                  color: "#e85a8d",
                  letterSpacing: "0.18em",
                  fontWeight: 700,
                  marginTop: 2,
                }}
              >
                $EQM · SOLANA
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

        {/* Tagline */}
        <div style={{ marginTop: 60, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 13,
              color: "#e85a8d",
              letterSpacing: "0.24em",
              fontWeight: 700,
              textTransform: "uppercase",
            }}
          >
            — A FAIR LAUNCH —
          </div>
          <div
            style={{
              fontSize: 92,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              marginTop: 20,
              display: "flex",
            }}
          >
            A token you
          </div>
          <div
            style={{
              fontSize: 92,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              color: "#e85a8d",
              marginTop: 4,
              display: "flex",
            }}
          >
            actually mine.
          </div>
        </div>

        {/* Footer stats */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div style={{ display: "flex", gap: 32 }}>
            <Stat label="Hard cap" value="21M" color="#e85a8d" />
            <Stat label="Block reward" value="25 EQM" color="#facc15" />
            <Stat label="Block height" value={state ? `#${state.blockHeight}` : "—"} color="#6ee7b7" />
            <Stat label="PoW" value="Equihash" color="#7dd3fc" />
          </div>
          <div
            style={{
              fontSize: 18,
              color: "#e85a8d",
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            equium.xyz
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
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
          fontSize: 30,
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
