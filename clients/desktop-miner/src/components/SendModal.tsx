import { useEffect, useState } from "react";
import { sendEqm, sendSol } from "../lib/api";
import { EQM_DECIMALS, formatEqm, formatSol } from "../lib/format";

type Token = "SOL" | "EQM";
type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "failed"; reason: string }
  | { kind: "sent"; sig: string };

const SOL_FEE_BUFFER = 5000; // lamports

type Props = {
  open: boolean;
  onClose: () => void;
  fromPubkey: string;
  solLamports: number;
  eqmBase: number;
  onSent?: () => void;
};

export default function SendModal({
  open,
  onClose,
  fromPubkey,
  solLamports,
  eqmBase,
  onSent,
}: Props) {
  const [token, setToken] = useState<Token>("SOL");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    if (open) {
      setToken("SOL");
      setRecipient("");
      setAmount("");
      setStatus({ kind: "idle" });
    }
  }, [open]);

  if (!open) return null;

  const recipientValid =
    isValidPubkey(recipient.trim()) && recipient.trim() !== fromPubkey;

  const recipientHint =
    recipient.length === 0
      ? null
      : !isValidPubkey(recipient.trim())
        ? "not a valid Solana address"
        : recipient.trim() === fromPubkey
          ? "that's your own address"
          : null;

  const max =
    token === "SOL"
      ? Math.max(0, (solLamports - SOL_FEE_BUFFER) / 1_000_000_000)
      : eqmBase / 10 ** EQM_DECIMALS;

  const amountNum = Number.parseFloat(amount);
  const amountValid =
    Number.isFinite(amountNum) && amountNum > 0 && amountNum <= max;

  const canSend =
    status.kind !== "sending" && recipientValid && amountValid;

  const setMax = () => {
    if (max <= 0) return;
    setAmount(token === "SOL" ? max.toFixed(6) : max.toFixed(EQM_DECIMALS));
  };

  const submit = async () => {
    if (!canSend) return;
    setStatus({ kind: "sending" });
    try {
      const r =
        token === "SOL"
          ? await sendSol(recipient.trim(), amountNum)
          : await sendEqm(recipient.trim(), amountNum);
      setStatus({ kind: "sent", sig: r.signature });
      onSent?.();
    } catch (e: any) {
      setStatus({ kind: "failed", reason: String(e).slice(0, 200) });
    }
  };

  const explorerUrl = (sig: string) =>
    `https://solscan.io/tx/${sig}`;

  return (
    <div className="modal-shroud" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 17 }}>Send tokens</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="toggle-group" style={{ marginBottom: 16 }}>
          {(["SOL", "EQM"] as const).map((t) => (
            <button
              key={t}
              className={`toggle-option ${token === t ? "on" : ""}`}
              onClick={() => setToken(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="row-between" style={{ marginBottom: 14 }}>
          <span className="mono dim" style={{ fontSize: 11 }}>
            available{" "}
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>
              {token === "SOL"
                ? `${formatSol(solLamports, 4)} SOL`
                : `${formatEqm(eqmBase, EQM_DECIMALS)} EQM`}
            </span>
          </span>
          <button
            className="copybtn"
            onClick={setMax}
            disabled={max <= 0}
            style={{ opacity: max <= 0 ? 0.4 : 1 }}
          >
            MAX
          </button>
        </div>

        <div className="stack-tight" style={{ marginBottom: 12 }}>
          <label className="field-label">Recipient address</label>
          <input
            type="text"
            className="text mono"
            placeholder="paste Solana address…"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            spellCheck={false}
            style={{ fontSize: 12.5 }}
          />
          {recipientHint && (
            <span
              className="mono"
              style={{
                fontSize: 11,
                color: recipientHint.includes("own")
                  ? "var(--gold)"
                  : "#8e3848",
              }}
            >
              {recipientHint}
            </span>
          )}
        </div>

        <div className="stack-tight" style={{ marginBottom: 6 }}>
          <label className="field-label">Amount</label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              className="text mono"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value.replace(/[^0-9.]/g, ""))
              }
              placeholder="0.0"
              inputMode="decimal"
              style={{
                fontSize: 18,
                fontWeight: 600,
                paddingRight: 56,
              }}
            />
            <span
              className="mono"
              style={{
                position: "absolute",
                right: 14,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--ink-dim)",
              }}
            >
              {token}
            </span>
          </div>
          {amount && Number.parseFloat(amount) > max && (
            <span className="mono" style={{ fontSize: 11, color: "#8e3848" }}>
              more than your available balance
            </span>
          )}
        </div>

        {token === "EQM" && (
          <p className="dim" style={{ fontSize: 11.5, marginTop: 10 }}>
            If the recipient has never held EQM, a small SOL fee (~0.002 SOL)
            will be paid from this wallet to create their token account.
          </p>
        )}

        {status.kind === "sent" && (
          <div className="alert alert-ok" style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>✓ Sent</div>
            <a
              href={explorerUrl(status.sig)}
              target="_blank"
              rel="noreferrer"
              className="mono"
              style={{ fontSize: 11, color: "var(--teal)", wordBreak: "break-all" }}
            >
              {status.sig}
            </a>
          </div>
        )}
        {status.kind === "failed" && (
          <div className="alert alert-err" style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Send failed</div>
            <div style={{ fontSize: 12 }}>{status.reason}</div>
          </div>
        )}

        <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button className="btn" onClick={onClose}>
            {status.kind === "sent" ? "Close" : "Cancel"}
          </button>
          <button
            className="btn btn-primary btn-lg"
            disabled={!canSend}
            onClick={submit}
          >
            {status.kind === "sending"
              ? "Sending…"
              : `Send${amount && amountValid ? ` ${amount} ${token}` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function isValidPubkey(s: string): boolean {
  // Solana addresses are base58 strings, typically 32–44 chars decoding to 32 bytes.
  if (s.length < 32 || s.length > 44) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}
