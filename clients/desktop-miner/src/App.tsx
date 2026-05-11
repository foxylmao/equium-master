import { useEffect, useState } from "react";
import { walletStatus, type WalletStatus } from "./lib/api";
import SetupWizard from "./components/SetupWizard";
import UnlockScreen from "./components/UnlockScreen";
import MineDashboard from "./components/MineDashboard";
import TopBar from "./components/TopBar";
import SettingsModal from "./components/SettingsModal";

export default function App() {
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const refresh = async () => {
    try {
      const s = await walletStatus();
      setStatus(s);
    } catch (e) {
      console.error("wallet_status failed", e);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const openSettings = () => setSettingsOpen(true);

  if (!status) {
    return (
      <div className="app">
        <TopBar onOpenSettings={openSettings} />
        <div className="main">
          <div className="empty">loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar
        status={status}
        onLocked={refresh}
        onOpenSettings={openSettings}
      />
      <div className="main">
        {status.status === "needs-setup" && (
          <SetupWizard onDone={refresh} />
        )}
        {status.status === "needs-unlock" && (
          <UnlockScreen pubkey={status.pubkey} onUnlocked={refresh} />
        )}
        {status.status === "unlocked" && (
          <MineDashboard
            pubkey={status.pubkey}
            onOpenSettings={openSettings}
          />
        )}
      </div>
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
