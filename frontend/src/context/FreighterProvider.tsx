"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

// ============================================================================
// Types
// ============================================================================

interface FreighterContextType {
  /** The connected wallet address, or null if not connected. */
  address: string | null;
  /** The current network (TESTNET, PUBLIC, FUTURENET). */
  network: string | null;
  /** Whether the wallet is currently connecting. */
  isConnecting: boolean;
  /** Whether the wallet is connected. */
  isConnected: boolean;
  /** Whether Freighter extension is installed. */
  isFreighterInstalled: boolean;
  /** Connect to the Freighter wallet. */
  connect: () => Promise<void>;
  /** Disconnect the wallet. */
  disconnect: () => void;
  /** Last error message, if any. */
  error: string | null;
}

// ============================================================================
// Context
// ============================================================================

const FreighterContext = createContext<FreighterContextType>({
  address: null,
  network: null,
  isConnecting: false,
  isConnected: false,
  isFreighterInstalled: false,
  connect: async () => {},
  disconnect: () => {},
  error: null,
});

// ============================================================================
// Provider Component
//
// TODO: [FE-2] Complete Freighter integration:
//   - Import @stellar/freighter-api
//   - Implement real checkConnection on mount
//   - Implement real connectWallet function
//   - Handle network switching events
// ============================================================================

export function FreighterProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFreighterInstalled, setIsFreighterInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if Freighter is installed on mount
  useEffect(() => {
    const checkFreighter = async () => {
      try {
        // TODO: Replace with actual Freighter API check
        // import { isConnected as checkInstalled } from "@stellar/freighter-api";
        // const installed = await checkInstalled();
        const installed = typeof window !== "undefined" && !!(window as any).freighter;
        setIsFreighterInstalled(installed);

        if (installed) {
          // TODO: Auto-reconnect if previously connected
          // const { isConnected } = await isConnected();
          // if (isConnected) { ... }
        }
      } catch (err) {
        console.error("Failed to check Freighter:", err);
      }
    };

    checkFreighter();
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // TODO: [FE-2] Replace with actual Freighter connection:
      // import { requestAccess, getAddress, getNetwork } from "@stellar/freighter-api";
      // const accessResponse = await requestAccess();
      // if (accessResponse.error) throw new Error(accessResponse.error);
      // const addressResponse = await getAddress();
      // const networkResponse = await getNetwork();
      // setAddress(addressResponse.address);
      // setNetwork(networkResponse.network);

      // Placeholder for development
      throw new Error(
        "Freighter wallet not integrated yet. See issue FE-2."
      );
    } catch (err: any) {
      setError(err.message || "Failed to connect wallet");
      console.error("Wallet connection failed:", err);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setNetwork(null);
    setError(null);
  }, []);

  return (
    <FreighterContext.Provider
      value={{
        address,
        network,
        isConnecting,
        isConnected: !!address,
        isFreighterInstalled,
        connect,
        disconnect,
        error,
      }}
    >
      {children}
    </FreighterContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useFreighter() {
  const context = useContext(FreighterContext);
  if (!context) {
    throw new Error("useFreighter must be used within a FreighterProvider");
  }
  return context;
}
