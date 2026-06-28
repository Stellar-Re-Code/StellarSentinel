"use client";

import { useState, useEffect, useCallback } from "react";
import { useFreighter, MockSigner } from "@/context/FreighterProvider";
import { buildContractCall, signAndSubmit, readContractValue, CONTRACT_IDS } from "@/lib/soroban";
import { Address } from "@stellar/stellar-sdk";

// ============================================================================
// Types
// ============================================================================

export interface TreasuryTransaction {
  id: number;
  to: string;
  amount: number; // in Stroops
  memo: string;
  approvals: string[]; // Signer addresses
  executed: boolean;
  canceled: boolean;
  created_at: number; // unix timestamp in seconds
  expires_at: number; // unix timestamp in seconds
  proposer: string;
  policy_version: number;
}

export interface TreasuryConfig {
  admin: string;
  threshold: number;
  signerCount: number;
  balance: number; // in Stroops
  txCount: number;
  policyVersion: number;
}

// Local Storage Keys
const MOCK_CONFIG_KEY = "stellarSentinel_mock_config";
const MOCK_TXS_KEY = "stellarSentinel_mock_txs";

// Mock Seed Data
const DEFAULT_CONFIG: TreasuryConfig = {
  admin: "GA3DFA75C2RYNXE2T33FIPNGB6W6KUX5IAJTGKIN2ER7LBNVKOCCWAAA", // Signer A
  threshold: 2,
  signerCount: 3,
  balance: 45000000000, // 4,500 XLM (in Stroops: 1 XLM = 10,000,000 Stroops)
  txCount: 5,
  policyVersion: 1,
};

const DEFAULT_TRANSACTIONS = (now: number): TreasuryTransaction[] => [
  {
    id: 1,
    to: "GD7V6M6Y3A33K33K33K33K33K33K33K33K33K33K33K33K33K33K33K3",
    amount: 1500000000, // 150 XLM
    memo: "Dev Hosting",
    approvals: ["GA3DFA75C2RYNXE2T33FIPNGB6W6KUX5IAJTGKIN2ER7LBNVKOCCWAAA"], // Signer A
    executed: false,
    canceled: false,
    created_at: now - 3600 * 2, // 2 hours ago
    expires_at: now + 3600 * 22, // 22 hours from now
    proposer: "GA3DFA75C2RYNXE2T33FIPNGB6W6KUX5IAJTGKIN2ER7LBNVKOCCWAAA",
    policy_version: 1,
  },
  {
    id: 2,
    to: "GB3KJPLGUZMRM3SBNI644UGB6N4T3PZEXQLEJNX24K4YBNMQTRQL6BQA",
    amount: 8000000000, // 800 XLM
    memo: "Audit Deposit",
    approvals: [
      "GA3DFA75C2RYNXE2T33FIPNGB6W6KUX5IAJTGKIN2ER7LBNVKOCCWAAA", // Signer A
      "GB3KJPLGUZMRM3SBNI644UGB6N4T3PZEXQLEJNX24K4YBNMQTRQL6BQA", // Signer B
    ],
    executed: false,
    canceled: false,
    created_at: now - 3600 * 12,
    expires_at: now + 3600 * 12,
    proposer: "GA3DFA75C2RYNXE2T33FIPNGB6W6KUX5IAJTGKIN2ER7LBNVKOCCWAAA",
    policy_version: 1,
  },
  {
    id: 3,
    to: "GDK2T5T7W4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4",
    amount: 3500000000, // 350 XLM
    memo: "Domain Registration",
    approvals: [
      "GB3KJPLGUZMRM3SBNI644UGB6N4T3PZEXQLEJNX24K4YBNMQTRQL6BQA", // Signer B
      "GDK2T5T7W4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4", // Signer C
    ],
    executed: true,
    canceled: false,
    created_at: now - 3600 * 48,
    expires_at: now - 3600 * 24,
    proposer: "GB3KJPLGUZMRM3SBNI644UGB6N4T3PZEXQLEJNX24K4YBNMQTRQL6BQA",
    policy_version: 1,
  },
  {
    id: 4,
    to: "GD7V6M6Y3A33K33K33K33K33K33K33K33K33K33K33K33K33K33K33K3",
    amount: 20000000000, // 2000 XLM
    memo: "Team Retreat",
    approvals: ["GDK2T5T7W4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4"], // Signer C
    executed: false,
    canceled: false,
    created_at: now - 3600 * 48,
    expires_at: now - 3600 * 1, // Expired 1 hour ago
    proposer: "GDK2T5T7W4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4H4",
    policy_version: 1,
  },
  {
    id: 5,
    to: "GA3DFA75C2RYNXE2T33FIPNGB6W6KUX5IAJTGKIN2ER7LBNVKOCCWAAA",
    amount: 1200000000, // 120 XLM
    memo: "Coffee Machine",
    approvals: ["GB3KJPLGUZMRM3SBNI644UGB6N4T3PZEXQLEJNX24K4YBNMQTRQL6BQA"], // Signer B
    executed: false,
    canceled: true,
    created_at: now - 3600 * 4,
    expires_at: now + 3600 * 20,
    proposer: "GB3KJPLGUZMRM3SBNI644UGB6N4T3PZEXQLEJNX24K4YBNMQTRQL6BQA",
    policy_version: 1,
  },
];

export function useTreasury() {
  const { address, isMockMode, mockSigners } = useFreighter();
  const [config, setConfig] = useState<TreasuryConfig | null>(null);
  const [transactions, setTransactions] = useState<TreasuryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper to check if an address is a multi-sig signer
  const isSigner = useCallback((addr: string | null): boolean => {
    if (!addr) return false;
    if (isMockMode) {
      return mockSigners.some((s) => s.address === addr && s.isSigner);
    }
    // For live mode, this would read from the contract signers list
    return true; 
  }, [isMockMode, mockSigners]);

  // Load and refresh state
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const now = Math.floor(Date.now() / 1000);

    if (isMockMode) {
      // Load from LocalStorage or initialize with defaults
      try {
        const storedConfig = localStorage.getItem(MOCK_CONFIG_KEY);
        const storedTxs = localStorage.getItem(MOCK_TXS_KEY);

        let finalConfig = storedConfig ? JSON.parse(storedConfig) : DEFAULT_CONFIG;
        let finalTxs = storedTxs ? JSON.parse(storedTxs) : DEFAULT_TRANSACTIONS(now);

        // Save back to ensure initialization is stored
        if (!storedConfig) localStorage.setItem(MOCK_CONFIG_KEY, JSON.stringify(finalConfig));
        if (!storedTxs) localStorage.setItem(MOCK_TXS_KEY, JSON.stringify(finalTxs));

        setConfig(finalConfig);
        setTransactions(finalTxs);
      } catch (err: any) {
        setError("Failed to load local mock database: " + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Live Soroban Mode
    try {
      if (!CONTRACT_IDS.treasury || CONTRACT_IDS.treasury === "PLACEHOLDER_TREASURY_CONTRACT_ID") {
        throw new Error("Treasury contract ID is not configured. Edit process.env.NEXT_PUBLIC_TREASURY_CONTRACT_ID.");
      }

      // Read values from simulated read calls
      const balanceVal = await readContractValue(CONTRACT_IDS.treasury, "get_balance");
      const configVal = await readContractValue(CONTRACT_IDS.treasury, "get_config");
      const signersVal = await readContractValue(CONTRACT_IDS.treasury, "get_signers");
      
      const balance = Number(balanceVal || 0);
      const activeConfig: TreasuryConfig = {
        admin: configVal?.admin || "",
        threshold: Number(configVal?.threshold || 1),
        signerCount: signersVal?.length || 0,
        balance,
        txCount: Number(configVal?.tx_count || 0),
        policyVersion: Number(configVal?.policy_version || 1),
      };

      // Query all transaction proposals
      const txsList: TreasuryTransaction[] = [];
      for (let i = 1; i <= activeConfig.txCount; i++) {
        try {
          const txVal = await readContractValue(CONTRACT_IDS.treasury, "get_transaction", [i]);
          if (txVal) {
            txsList.push({
              id: Number(txVal.id),
              to: txVal.to.toString(),
              amount: Number(txVal.amount),
              memo: txVal.memo.toString(),
              approvals: txVal.approvals.map((a: any) => a.toString()),
              executed: !!txVal.executed,
              canceled: !!txVal.canceled,
              created_at: Number(txVal.created_at),
              expires_at: Number(txVal.expires_at),
              proposer: txVal.proposer.toString(),
              policy_version: Number(txVal.policy_version),
            });
          }
        } catch {
          // Ignore missing tx IDs safely
        }
      }

      setConfig(activeConfig);
      setTransactions(txsList);
    } catch (err: any) {
      setError(err.message || "Failed to fetch data from Soroban RPC");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [isMockMode]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Deposit funds
  const deposit = async (amount: number): Promise<void> => {
    if (amount <= 0) throw new Error("Deposit amount must be greater than zero");
    setError(null);

    const stroops = amount * 10000000;

    if (isMockMode) {
      if (!config) return;
      const updatedConfig = { ...config, balance: config.balance + stroops };
      localStorage.setItem(MOCK_CONFIG_KEY, JSON.stringify(updatedConfig));
      setConfig(updatedConfig);
      return;
    }

    // Live mode
    if (!address) throw new Error("Wallet not connected");
    const xdr = await buildContractCall(CONTRACT_IDS.treasury, "deposit", [address, stroops], address);
    await signAndSubmit(xdr, address);
    await refresh();
  };

  // Propose a withdrawal
  const proposeWithdrawal = async (
    to: string,
    amount: number, // in XLM
    memo: string,
    expiryHours: number = 24
  ): Promise<number> => {
    if (!address) throw new Error("Wallet not connected");
    if (!isSigner(address)) throw new Error("Only authorized signers can propose withdrawals");
    if (amount <= 0) throw new Error("Withdrawal amount must be greater than zero");

    const stroops = amount * 10000000;
    
    if (isMockMode) {
      if (!config) throw new Error("Treasury config not loaded");
      if (config.balance < stroops) throw new Error("Treasury does not have enough funds to process withdrawal");

      const now = Math.floor(Date.now() / 1000);
      const nextId = config.txCount + 1;
      
      const newTx: TreasuryTransaction = {
        id: nextId,
        to,
        amount: stroops,
        memo: memo || "Withdrawal Proposal",
        approvals: [address], // proposer automatically approves
        executed: false,
        canceled: false,
        created_at: now,
        expires_at: now + 3600 * expiryHours,
        proposer: address,
        policy_version: config.policyVersion,
      };

      const updatedTxs = [newTx, ...transactions];
      const updatedConfig = { ...config, txCount: nextId };

      localStorage.setItem(MOCK_TXS_KEY, JSON.stringify(updatedTxs));
      localStorage.setItem(MOCK_CONFIG_KEY, JSON.stringify(updatedConfig));

      setConfig(updatedConfig);
      setTransactions(updatedTxs);
      return nextId;
    }

    // Live Mode
    const expiresAt = Math.floor(Date.now() / 1000) + 3600 * expiryHours;
    const xdr = await buildContractCall(
      CONTRACT_IDS.treasury,
      "propose_withdrawal",
      [address, to, stroops, memo, expiresAt],
      address
    );
    const hash = await signAndSubmit(xdr, address);
    await refresh();
    
    // Read new transaction count from contract to return the generated ID
    const newConfigVal = await readContractValue(CONTRACT_IDS.treasury, "get_config");
    return Number(newConfigVal?.tx_count || 0);
  };

  // Approve a proposal
  const approve = async (txId: number): Promise<void> => {
    if (!address) throw new Error("Wallet not connected");
    if (!isSigner(address)) throw new Error("Only authorized signers can approve transactions");

    if (isMockMode) {
      if (!config) return;
      const txIndex = transactions.findIndex((t) => t.id === txId);
      if (txIndex === -1) throw new Error("Transaction proposal not found");
      
      const tx = transactions[txIndex];
      if (tx.executed) throw new Error("Transaction has already been executed");
      if (tx.canceled) throw new Error("Transaction has been canceled");
      if (Math.floor(Date.now() / 1000) > tx.expires_at) throw new Error("Transaction has expired");
      if (tx.policy_version !== config.policyVersion) throw new Error("Transaction policy has been invalidated");
      if (tx.approvals.includes(address)) throw new Error("Signer has already approved this transaction");

      const updatedTxs = [...transactions];
      updatedTxs[txIndex] = {
        ...tx,
        approvals: [...tx.approvals, address],
      };

      localStorage.setItem(MOCK_TXS_KEY, JSON.stringify(updatedTxs));
      setTransactions(updatedTxs);
      return;
    }

    // Live Mode
    const xdr = await buildContractCall(CONTRACT_IDS.treasury, "approve", [address, txId], address);
    await signAndSubmit(xdr, address);
    await refresh();
  };

  // Revoke an approval
  const revokeApproval = async (txId: number): Promise<void> => {
    if (!address) throw new Error("Wallet not connected");
    if (!isSigner(address)) throw new Error("Only authorized signers can revoke approvals");

    if (isMockMode) {
      if (!config) return;
      const txIndex = transactions.findIndex((t) => t.id === txId);
      if (txIndex === -1) throw new Error("Transaction proposal not found");

      const tx = transactions[txIndex];
      if (tx.executed) throw new Error("Transaction has already been executed");
      if (tx.canceled) throw new Error("Transaction has been canceled");
      if (Math.floor(Date.now() / 1000) > tx.expires_at) throw new Error("Transaction has expired");
      if (tx.policy_version !== config.policyVersion) throw new Error("Transaction policy has been invalidated");
      if (!tx.approvals.includes(address)) throw new Error("Signer has not approved this transaction");

      const updatedTxs = [...transactions];
      updatedTxs[txIndex] = {
        ...tx,
        approvals: tx.approvals.filter((a) => a !== address),
      };

      localStorage.setItem(MOCK_TXS_KEY, JSON.stringify(updatedTxs));
      setTransactions(updatedTxs);
      return;
    }

    // Live Mode
    const xdr = await buildContractCall(CONTRACT_IDS.treasury, "revoke_approval", [address, txId], address);
    await signAndSubmit(xdr, address);
    await refresh();
  };

  // Cancel a proposal
  const cancelWithdrawal = async (txId: number): Promise<void> => {
    if (!address) throw new Error("Wallet not connected");

    if (isMockMode) {
      if (!config) return;
      const txIndex = transactions.findIndex((t) => t.id === txId);
      if (txIndex === -1) throw new Error("Transaction proposal not found");

      const tx = transactions[txIndex];
      if (tx.executed) throw new Error("Transaction has already been executed");
      if (tx.canceled) throw new Error("Transaction has been canceled");
      
      const admin = config.admin;
      if (address !== tx.proposer && address !== admin) {
        throw new Error("Caller is not authorized for this operation");
      }

      const updatedTxs = [...transactions];
      updatedTxs[txIndex] = {
        ...tx,
        canceled: true,
      };

      localStorage.setItem(MOCK_TXS_KEY, JSON.stringify(updatedTxs));
      setTransactions(updatedTxs);
      return;
    }

    // Live Mode
    const xdr = await buildContractCall(CONTRACT_IDS.treasury, "cancel_withdrawal", [address, txId], address);
    await signAndSubmit(xdr, address);
    await refresh();
  };

  // Execute a fully approved transaction
  const execute = async (txId: number): Promise<void> => {
    if (!address) throw new Error("Wallet not connected");

    if (isMockMode) {
      if (!config) return;
      const txIndex = transactions.findIndex((t) => t.id === txId);
      if (txIndex === -1) throw new Error("Transaction proposal not found");

      const tx = transactions[txIndex];
      if (tx.executed) throw new Error("Transaction has already been executed");
      if (tx.canceled) throw new Error("Transaction has been canceled");
      if (Math.floor(Date.now() / 1000) > tx.expires_at) throw new Error("Transaction has expired");
      if (tx.policy_version !== config.policyVersion) throw new Error("Transaction policy has been invalidated");

      if (tx.approvals.length < config.threshold) {
        throw new Error("Caller is not authorized: approval threshold not met");
      }

      if (config.balance < tx.amount) {
        throw new Error("Treasury does not have enough funds to process withdrawal");
      }

      const updatedTxs = [...transactions];
      updatedTxs[txIndex] = {
        ...tx,
        executed: true,
      };

      const updatedConfig = {
        ...config,
        balance: config.balance - tx.amount,
      };

      localStorage.setItem(MOCK_TXS_KEY, JSON.stringify(updatedTxs));
      localStorage.setItem(MOCK_CONFIG_KEY, JSON.stringify(updatedConfig));

      setConfig(updatedConfig);
      setTransactions(updatedTxs);
      return;
    }

    // Live Mode
    const xdr = await buildContractCall(CONTRACT_IDS.treasury, "execute", [address, txId], address);
    await signAndSubmit(xdr, address);
    await refresh();
  };

  // Helper function to simulate policy changes/signers updates
  const simulatePolicyChange = (): void => {
    if (!isMockMode || !config) return;
    const newPolicyVersion = config.policyVersion + 1;
    const updatedConfig = {
      ...config,
      policyVersion: newPolicyVersion,
    };
    localStorage.setItem(MOCK_CONFIG_KEY, JSON.stringify(updatedConfig));
    setConfig(updatedConfig);
  };

  return {
    config,
    transactions,
    loading,
    error,
    isSigner,
    deposit,
    proposeWithdrawal,
    approve,
    revokeApproval,
    cancelWithdrawal,
    execute,
    refresh,
    simulatePolicyChange,
  };
}
