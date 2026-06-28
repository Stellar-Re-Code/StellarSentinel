"use client";

import { useFreighter } from "@/context/FreighterProvider";
import { useState, useRef, useEffect } from "react";

interface WalletConnectProps {
  className?: string;
}

export function WalletConnect({ className = "" }: WalletConnectProps) {
  const {
    address,
    isConnecting,
    isConnected,
    isFreighterInstalled,
    connect,
    disconnect,
    isMockMode,
    toggleMockMode,
    mockSigners,
    activeMockSigner,
    selectMockSigner,
  } = useFreighter();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const truncateAddress = (addr: string): string => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!isFreighterInstalled && !isMockMode) {
    return (
      <a
        href="https://www.freighter.app/"
        target="_blank"
        rel="noopener noreferrer"
        className={`px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium text-sm transition-colors ${className}`}
      >
        Install Freighter
      </a>
    );
  }

  if (isConnecting) {
    return (
      <button
        disabled
        className={`flex items-center space-x-2 px-4 py-2 bg-stellar-dark border border-stellar-border text-gray-400 rounded text-sm ${className}`}
      >
        <svg
          className="animate-spin h-4 w-4 text-primary"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span>Connecting...</span>
      </button>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex items-center space-x-2">
        {/* Mock/Live switch */}
        <button
          onClick={() => toggleMockMode(!isMockMode)}
          className={`text-xs px-2 py-1 rounded border ${
            isMockMode
              ? "bg-yellow-950/40 text-yellow-500 border-yellow-800"
              : "bg-green-950/40 text-green-500 border-green-800"
          }`}
          title="Toggle between Live testnet and Dev Mock simulation mode"
        >
          {isMockMode ? "Mock Mode" : "Live Mode"}
        </button>
        <button
          onClick={connect}
          className={`btn-primary text-sm font-semibold shadow-md shadow-primary/20 ${className}`}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center space-x-2">
        <span
          className={`text-xs px-2 py-1 rounded border ${
            isMockMode
              ? "bg-yellow-950/40 text-yellow-500 border-yellow-800"
              : "bg-green-950/40 text-green-500 border-green-800"
          }`}
        >
          {isMockMode ? "Mock" : "Live"}
        </span>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className={`flex items-center space-x-2 px-4 py-2 bg-stellar-dark hover:bg-stellar-dark/80 border border-stellar-border rounded text-sm text-white font-mono hover:border-primary-400 transition-colors ${className}`}
        >
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span>{truncateAddress(address || "")}</span>
          <svg
            className="w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-stellar-dark border border-stellar-border rounded-lg shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-4 py-2 border-b border-stellar-border mb-2">
            <p className="text-xs text-gray-400 font-medium">CONNECTED ADDRESS</p>
            <p className="text-sm font-mono text-white mt-1 break-all select-all">
              {address}
            </p>
          </div>

          {isMockMode && (
            <div className="px-4 py-2 border-b border-stellar-border mb-2">
              <p className="text-xs text-gray-400 font-semibold mb-2">
                SWITCH MOCK SIGNER
              </p>
              <div className="space-y-1">
                {mockSigners.map((signer) => (
                  <button
                    key={signer.address}
                    onClick={() => {
                      selectMockSigner(signer.address);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex justify-between items-center ${
                      address === signer.address
                        ? "bg-primary-950/60 text-primary-400 border border-primary-800/40"
                        : "text-gray-300 hover:bg-stellar-border hover:text-white"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span>{signer.name}</span>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {truncateAddress(signer.address)}
                      </span>
                    </div>
                    {address === signer.address && (
                      <span className="text-[10px] bg-primary-800/20 text-primary-400 px-1 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="px-4 py-1">
            <button
              onClick={() => {
                toggleMockMode(!isMockMode);
                setDropdownOpen(false);
              }}
              className="w-full text-center text-xs py-1.5 border border-stellar-border rounded text-gray-300 hover:text-white hover:bg-stellar-border transition-all mb-2"
            >
              Switch to {isMockMode ? "Live mode" : "Mock mode"}
            </button>
            <button
              onClick={() => {
                disconnect();
                setDropdownOpen(false);
              }}
              className="w-full text-center text-xs py-1.5 bg-red-950/40 border border-red-900 text-red-400 rounded hover:bg-red-900/40 hover:text-red-300 transition-all font-medium"
            >
              Disconnect Wallet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
