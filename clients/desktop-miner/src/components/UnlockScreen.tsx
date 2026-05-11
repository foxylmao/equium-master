import { useState } from "react";
import { unlockWallet, forgetWallet } from "../lib/api";
import { shortPk } from "../lib/format";

type Props = {
  pubkey: string;
  onUnlocked: () => void;
};

export default function UnlockScreen({ pubkey, onUnlocked }: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmingWipe, setConfirmingWipe] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setErr(null);
    try {
      await unlockWallet(password);
      onUnlocked();
    } catch (e: any) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const wipe = async () => {
    await forgetWallet();
    onUnlocked();
  };

  return (
    <div className="center-screen">
      <div className="center-card stack">
        <div className="card stack">
          <h1>Unlock wallet</h1>
          <p className="muted">
            <span className="mono">{shortPk(pubkey, 6, 6)}</span>
          </p>
          <form onSubmit={submit} className="stack">
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
            {err && <div className="alert alert-err">{err}</div>}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmingWipe(true)}
              >
                Forgot password?
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !password}
              >
                {busy ? "Unlocking…" : "Unlock"}
              </button>
            </div>
          </form>
        </div>

        {confirmingWipe && (
          <div className="card stack" style={{ borderColor: "#e7b9b9" }}>
            <h2 style={{ color: "#7a3030" }}>Wipe this wallet?</h2>
            <p className="muted">
              Without your password, there's no way to decrypt the local
              keystore. If you don't have your backup secret key written down
              somewhere else, deleting it means losing access to those funds
              forever.
            </p>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button
                className="btn"
                onClick={() => setConfirmingWipe(false)}
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={wipe}>
                I understand — wipe
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
