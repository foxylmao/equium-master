import { lockWallet, type WalletStatus } from "../lib/api";
import { shortPk } from "../lib/format";

type Props = {
  status?: WalletStatus;
  onLocked?: () => void;
  onOpenSettings: () => void;
};

export default function TopBar({ status, onLocked, onOpenSettings }: Props) {
  const onLock = async () => {
    await lockWallet();
    onLocked?.();
  };

  return (
    <header className="topbar">
      <div className="brand">
        <img src="/logo.png" alt="" className="brand-logo" />
        <span className="brand-name">Equium</span>
        <span className="brand-mono">$EQM</span>
      </div>
      <div className="topbar-right">
        {status?.status === "unlocked" && (
          <span className="pill pill-ok mono">
            <span className="dot dot-ok" />
            {shortPk(status.pubkey, 4, 4)}
          </span>
        )}
        <button className="btn btn-ghost" onClick={onOpenSettings}>
          Settings
        </button>
        {status?.status === "unlocked" && (
          <button className="btn" onClick={onLock}>
            Lock
          </button>
        )}
      </div>
    </header>
  );
}
