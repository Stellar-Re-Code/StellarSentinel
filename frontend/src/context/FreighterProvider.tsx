"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import * as freighter from "@stellar/freighter-api";

// ============================================================================
// Types
// ============================================================================

export interface MockSigner {
  name: string;
  address: string;
  isSigner: boolean;
}

export const MOCK_SIGNERS: MockSigner[] = [
  { name: "Signer A (Owner)", address: "GA3DFA75C2RYNXE2T33FIPNGB6W6KUX5IAJTGKIN2ER7LBNVKOCCWAAA", isSigner: true },
  { name: "Signer B (Co-Signer)", address: "GB3KJPLGUZMRM3SBNI644UGB6N4T3PZEXQLEJNX24K4YBNMQTRQL6BQA", isSigner: true },
  { name: "Signer C (Co-Signer)", address: "GDK2T5T7W4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4", isSigner: true },
  { name: "Executor (Non-Signer)", address: "GD7V6M6Y3A33K33K33K33K33K33K33K33K33K33K33K33K33K33K33K3", isSigner: false },
];

interface FreighterContextType {
  address: string | null;
  network: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  isFreighterInstalled: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string | null;
  
  // Mock Mode Extensions for testing E2E multisig
  isMockMode: boolean;
  toggleMockMode: (enabled: boolean) => void;
  mockSigners: MockSigner[];
  activeMockSigner: MockSigner | null;
  selectMockSigner: (address: string) => void;
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
  isMockMode: true,
  toggleMockMode: () => {},
  mockSigners: [],
  activeMockSigner: null,
  selectMockSigner: () => {},
});

// ============================================================================
// Provider Component
// ============================================================================

export function FreighterProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFreighterInstalled, setIsFreighterInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mock Mode state
  const [isMockMode, setIsMockModeState] = useState<boolean>(true);
  const [activeMockSigner, setActiveMockSigner] = useState<MockSigner | null>(MOCK_SIGNERS[0]);

  // Check if Freighter is installed on mount
  useEffect(() => {
    const checkFreighter = async () => {
      try {
        const installed = await freighter.isConnected();
        setIsFreighterInstalled(!!installed);
        
        // Auto-detect: if Freighter is installed, default to live mode
        if (installed) {
          setIsMockModeState(false);
          try {
            const publicKey = await freighter.getPublicKey();
            const net = await freighter.getNetwork();
            if (publicKey) setAddress(publicKey);
            if (net) setNetwork(net);
          } catch (e) {
            console.warn("Freighter not authorized yet:", e);
          }
        } else {
          // If no Freighter, default to mock mode
          setIsMockModeState(true);
          setAddress(MOCK_SIGNERS[0].address);
          setNetwork("TESTNET");
        }
      } catch (err) {
        console.error("Failed to check Freighter:", err);
        // Fallback to mock mode safely
        setIsMockModeState(true);
        setAddress(MOCK_SIGNERS[0].address);
        setNetwork("TESTNET");
      }
    };

    checkFreighter();
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    if (isMockMode) {
      // Mock wallet connection
      setTimeout(() => {
        if (activeMockSigner) {
          setAddress(activeMockSigner.address);
        } else {
          setAddress(MOCK_SIGNERS[0].address);
          setActiveMockSigner(MOCK_SIGNERS[0]);
        }
        setNetwork("TESTNET");
        setIsConnecting(false);
      }, 500);
      return;
    }

    try {
      const publicKey = await freighter.requestAccess();
      if (!publicKey) throw new Error("Access denied by user");
      
      const net = await freighter.getNetwork();

      setAddress(publicKey);
      setNetwork(net);
    } catch (err: any) {
      setError(err.message || "Failed to connect wallet");
      console.error("Wallet connection failed:", err);
    } finally {
      setIsConnecting(false);
    }
  }, [isMockMode, activeMockSigner]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setNetwork(null);
    setError(null);
  }, []);

  const toggleMockMode = useCallback((enabled: boolean) => {
    setIsMockModeState(enabled);
    if (enabled) {
      const signer = activeMockSigner || MOCK_SIGNERS[0];
      setAddress(signer.address);
      setActiveMockSigner(signer);
      setNetwork("TESTNET");
    } else {
      setAddress(null);
      setNetwork(null);
    }
  }, [activeMockSigner]);

  const selectMockSigner = useCallback((addr: string) => {
    const signer = MOCK_SIGNERS.find((s) => s.address === addr) || MOCK_SIGNERS[0];
    setActiveMockSigner(signer);
    if (isMockMode) {
      setAddress(signer.address);
    }
  }, [isMockMode]);

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
        isMockMode,
        toggleMockMode,
        mockSigners: MOCK_SIGNERS,
        activeMockSigner,
        selectMockSigner,
      }}
    >
      {children}
    </FreighterContext.Provider>
  );
}

export function useFreighter() {
  const context = useContext(FreighterContext);
  if (!context) {
    throw new Error("useFreighter must be used within a FreighterProvider");
  }
  return context;
}
