import { useState } from "react";
import {
  createWallet,
  importWallet,
  exportSecret,
} from "../lib/api";
import { copyText } from "../lib/clipboard";

type Mode = "choose" | "create-password" | "create-reveal" | "import";

type Props = {
  onDone: () => void;
};

export default function SetupWizard({ onDone }: Props) {
  const [mode, setMode] = useState<Mode>("choose");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [secretInput, setSecretInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ pubkey: string; secret: string } | null>(
    null
  );

  const reset = () => {
    setPassword("");
    setPassword2("");
    setSecretInput("");
    setErr(null);
  };

  if (mode === "choose") {
    return (
      <div className="center-screen">
        <div className="center-card stack">
          <div className="card stack">
            <h1>Welcome to Equium</h1>
            <p className="muted">
              CPU-mineable Solana token. Your wallet stays on this machine,
              encrypted with a password only you know.
            </p>
            <div className="divider" />
            <button
              className="btn btn-primary"
              style={{ justifyContent: "center", padding: 14 }}
              onClick={() => {
                reset();
                setMode("create-password");
              }}
            >
              Create new wallet
            </button>
            <button
              className="btn"
              style={{ justifyContent: "center", padding: 14 }}
              onClick={() => {
                reset();
                setMode("import");
              }}
            >
              Import existing keypair
            </button>
          </div>
          <p className="dim" style={{ fontSize: 12, textAlign: "center" }}>
            Your encrypted wallet file lives in the app's local data folder.
            Forget your password and the funds are gone — there's no recovery.
          </p>
        </div>
      </div>
    );
  }

  if (mode === "create-password") {
    const tooShort = password.length > 0 && password.length < 8;
    const mismatch = password2.length > 0 && password !== password2;
    const canSubmit =
      password.length >= 8 && password === password2 && !busy;

    const submit = async () => {
      setBusy(true);
      setErr(null);
      try {
        await createWallet(password);
        const secret = await exportSecret();
        setReveal({ pubkey: "", secret });
        setMode("create-reveal");
      } catch (e: any) {
        setErr(String(e));
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="center-screen">
        <div className="center-card stack">
          <div className="card stack">
            <h1>Set a password</h1>
            <p className="muted">
              Used to encrypt your wallet on disk. Min 8 characters. There is
              no "forgot password" — write it down.
            </p>
            <div>
              <span className="field-label">Password</span>
              <input
                type="password"
                className="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <span className="field-label">Confirm</span>
              <input
                type="password"
                className="text"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </div>
            {tooShort && (
              <p className="muted" style={{ fontSize: 12 }}>
                At least 8 characters.
              </p>
            )}
            {mismatch && (
              <p className="muted" style={{ fontSize: 12 }}>
                Passwords don't match.
              </p>
            )}
            {err && <div className="alert alert-err">{err}</div>}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button className="btn" onClick={() => setMode("choose")}>
                Back
              </button>
              <button
                className="btn btn-primary"
                disabled={!canSubmit}
                onClick={submit}
              >
                {busy ? "Creating…" : "Create wallet"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "create-reveal" && reveal) {
    return (
      <div className="center-screen">
        <div className="center-card stack">
          <div className="card stack">
            <h1>Back up your secret key</h1>
            <p className="muted">
              This is the only key to your wallet. If you lose access to this
              computer, this base58 string is how you restore funds.{" "}
              <strong>Do not share it. Store it offline.</strong>
            </p>

            <BlurredReveal text={reveal.secret} />

            <div className="row" style={{ gap: 8 }}>
              <button
                className="copybtn"
                onClick={() => copyText(reveal.secret)}
              >
                Copy to clipboard
              </button>
            </div>

            <div className="alert">
              Tip: write it on paper. A photo in cloud storage is worse than
              no backup at all.
            </div>

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-primary" onClick={onDone}>
                I've saved it — continue
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "import") {
    const submit = async () => {
      if (!secretInput.trim()) {
        setErr("paste your secret key first");
        return;
      }
      if (password.length < 8) {
        setErr("password must be at least 8 characters");
        return;
      }
      if (password !== password2) {
        setErr("passwords don't match");
        return;
      }
      setBusy(true);
      setErr(null);
      try {
        await importWallet(secretInput.trim(), password);
        onDone();
      } catch (e: any) {
        setErr(String(e));
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="center-screen">
        <div className="center-card stack">
          <div className="card stack">
            <h1>Import existing wallet</h1>
            <p className="muted">
              Paste a base58 secret key (Phantom export) or a 64-element JSON
              byte array (solana-keygen format).
            </p>
            <div>
              <span className="field-label">Secret key</span>
              <textarea
                className="text mono"
                rows={3}
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                placeholder="base58… or [12,34,56,…]"
              />
            </div>
            <div>
              <span className="field-label">Password to encrypt it on disk</span>
              <input
                type="password"
                className="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <span className="field-label">Confirm password</span>
              <input
                type="password"
                className="text"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </div>
            {err && <div className="alert alert-err">{err}</div>}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button className="btn" onClick={() => setMode("choose")}>
                Back
              </button>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={submit}
              >
                {busy ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function BlurredReveal({ text }: { text: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div
      className="secret-box"
      onClick={() => setShown(true)}
      title={shown ? "" : "Click to reveal"}
    >
      <div className={shown ? "" : "shroud"}>{text}</div>
      {!shown && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ink-soft)",
            fontSize: 13,
            pointerEvents: "none",
          }}
        >
          click to reveal
        </div>
      )}
    </div>
  );
}
