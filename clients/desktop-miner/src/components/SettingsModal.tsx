import { useEffect, useState } from "react";
import { getSettings, setRpcUrl, type Settings } from "../lib/api";

type Props = {
  onClose: () => void;
};

export default function SettingsModal({ onClose }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setDraft(s.rpc_url);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await setRpcUrl(draft);
      onClose();
    } catch (e: any) {
      setErr(String(e));
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(74,46,31,0.35)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h2>Settings</h2>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="stack">
          <div>
            <span className="field-label">Cluster</span>
            <div className="pill">{settings?.cluster ?? "—"}</div>
          </div>

          <div>
            <span className="field-label">Custom RPC URL (Helius recommended)</span>
            <input
              type="text"
              className="text mono"
              placeholder="https://mainnet.helius-rpc.com/?api-key=…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Leave blank to use the default public endpoint. Public endpoints
              are rate-limited; serious mining needs your own Helius/Triton key.
            </p>
          </div>

          {err && <div className="alert alert-err">{err}</div>}

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button
              className="btn"
              onClick={() => {
                setDraft("");
              }}
            >
              Clear
            </button>
            <button
              className="btn btn-primary"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
