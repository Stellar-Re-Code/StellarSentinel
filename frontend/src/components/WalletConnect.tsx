"use client";

// TODO: [FE-3] Complete WalletConnect component:
//   - Import useFreighter hook
//   - Show "Install Freighter" if not installed
//   - Show loading spinner during connection
//   - Show truncated address when connected
//   - Add disconnect option (dropdown or click)

interface WalletConnectProps {
  className?: string;
}

/**
 * Smart wallet connect button that handles different auth states:
 * - Not Installed: Links to Freighter extension
 * - Disconnected: Shows "Connect Wallet"
 * - Connecting: Shows loading spinner
 * - Connected: Shows truncated address with disconnect option
 */
export function WalletConnect({ className = "" }: WalletConnectProps) {
  // TODO: const { address, isConnecting, isConnected, isFreighterInstalled, connect, disconnect } = useFreighter();

  const truncateAddress = (addr: string): string => {
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  // Placeholder — will be replaced when FE-2 and FE-3 are implemented
  return (
    <button
      className={`btn-secondary text-sm ${className}`}
      onClick={() => {
        alert(
          "Wallet connection not yet implemented. See issues FE-2 and FE-3."
        );
      }}
    >
      Connect Wallet
    </button>
  );
}
