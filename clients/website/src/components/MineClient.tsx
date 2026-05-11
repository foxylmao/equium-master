"use client";

import { WalletProvider, useWallet } from "@/lib/wallet-context";
import { SetupWizard } from "./wallet/SetupWizard";
import { UnlockScreen } from "./wallet/UnlockScreen";
import { MineDashboard } from "./MineDashboard";

export default function MineClient() {
  return (
    <WalletProvider>
      <MineGate />
    </WalletProvider>
  );
}

function MineGate() {
  const wallet = useWallet();

  if (wallet.status === "loading") {
    return (
      <div className="text-center py-32 text-[var(--color-fg-dim)]">
        Loading wallet…
      </div>
    );
  }
  if (wallet.status === "needs-setup") {
    return <SetupWizard />;
  }
  if (wallet.status === "needs-unlock") {
    return <UnlockScreen />;
  }
  return <MineDashboard />;
}
