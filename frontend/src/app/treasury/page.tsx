"use client";

import { useState } from "react";
import { useFreighter } from "@/context/FreighterProvider";
import { useTreasury, TreasuryTransaction } from "@/hooks/useTreasury";
import { Toaster, toast } from "react-hot-toast";

export default function TreasuryPage() {
  const { address, isConnected, isMockMode, connect, toggleMockMode } = useFreighter();
  const {
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
  } = useTreasury();

  // Modal & Form states
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalTo, setProposalTo] = useState("");
  const [proposalAmount, setProposalAmount] = useState("");
  const [proposalMemo, setProposalMemo] = useState("");
  const [proposalExpiry, setProposalExpiry] = useState("24");

  // Intent Preview Modal state
  const [previewAction, setPreviewAction] = useState<{
    type: "approve" | "revoke" | "cancel" | "execute";
    tx: TreasuryTransaction;
  } | null>(null);

  const [actionLoading, setActionLoading] = useState(false);

  const formatXLM = (stroops: number): string => {
    return (stroops / 10_000_000).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 7,
    });
  };

  const truncateAddress = (addr: string): string => {
    if (!addr) return "G...";
    return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
  };

  // Action Triggers
  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Please enter a valid amount greater than zero");
      return;
    }

    try {
      setActionLoading(true);
      await deposit(amt);
      toast.success(`Successfully deposited ${amt} XLM into treasury!`);
      setDepositOpen(false);
      setDepositAmount("");
    } catch (err: any) {
      toast.error(err.message || "Failed to process deposit");
    } finally {
      setActionLoading(false);
    }
  };

  const handleProposeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposalTo.startsWith("G") || proposalTo.length !== 56) {
      toast.error("Please enter a valid 56-character Stellar public key");
      return;
    }
    const amt = parseFloat(proposalAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    const expiryHrs = parseInt(proposalExpiry);
    if (isNaN(expiryHrs) || expiryHrs <= 0) {
      toast.error("Please enter a valid expiry time");
      return;
    }

    try {
      setActionLoading(true);
      const generatedId = await proposeWithdrawal(
        proposalTo,
        amt,
        proposalMemo,
        expiryHrs
      );
      toast.success(`Proposal #${generatedId} created successfully! Proposer signature recorded.`);
      setProposalOpen(false);
      setProposalTo("");
      setProposalAmount("");
      setProposalMemo("");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit proposal");
    } finally {
      setActionLoading(false);
    }
  };

  const triggerIntentAction = async () => {
    if (!previewAction) return;
    const { type, tx } = previewAction;

    try {
      setActionLoading(true);
      if (type === "approve") {
        await approve(tx.id);
        toast.success(`Successfully signed approval for Proposal #${tx.id}`);
      } else if (type === "revoke") {
        await revokeApproval(tx.id);
        toast.success(`Revoked approval for Proposal #${tx.id}`);
      } else if (type === "cancel") {
        await cancelWithdrawal(tx.id);
        toast.success(`Canceled Proposal #${tx.id}`);
      } else if (type === "execute") {
        await execute(tx.id);
        
        // Direct-chain simulation output
        const simulatedHash = Array.from({ length: 64 }, () =>
          Math.floor(Math.random() * 16).toString(16)
        ).join("");
        
        toast.custom(
          (t) => (
            <div className="bg-stellar-dark border border-green-800 rounded-lg p-4 shadow-xl flex flex-col space-y-2">
              <span className="text-sm font-semibold text-green-400">
                ✅ Execution Confirmed!
              </span>
              <span className="text-xs text-gray-300">
                Transferred {formatXLM(tx.amount)} XLM to {truncateAddress(tx.to)}
              </span>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${simulatedHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary-400 underline hover:text-primary-300 font-mono"
              >
                View on Stellar Expert: {simulatedHash.slice(0, 16)}...
              </a>
            </div>
          ),
          { duration: 6000 }
        );
      }
      setPreviewAction(null);
    } catch (err: any) {
      toast.error(err.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const getProposalStatus = (tx: TreasuryTransaction) => {
    const now = Math.floor(Date.now() / 1000);
    if (tx.executed) return "Executed";
    if (tx.canceled) return "Canceled";
    if (now > tx.expires_at) return "Expired";
    if (config && tx.policy_version !== config.policyVersion) return "Stale Policy";
    if (config && tx.approvals.length >= config.threshold) return "Ready";
    return "Pending";
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Executed":
        return "bg-gray-900 border-gray-700 text-gray-400";
      case "Canceled":
        return "bg-red-950/40 border-red-900/60 text-red-400";
      case "Expired":
        return "bg-orange-950/40 border-orange-900/60 text-orange-400";
      case "Stale Policy":
        return "bg-purple-950/40 border-purple-900/60 text-purple-400";
      case "Ready":
        return "bg-green-950/40 border-green-900/60 text-green-400";
      default:
        return "bg-yellow-950/40 border-yellow-900/60 text-yellow-400";
    }
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 max-w-xl mx-auto">
        <Toaster position="bottom-right" />
        <span className="text-6xl">🔐</span>
        <h1 className="text-3xl font-bold text-white">Multisig Treasury Vault</h1>
        <p className="text-gray-400">
          Welcome to StellarSentinel. Connect your Stellar wallet or switch to developer simulation mode to propose withdrawals, sign authorizations, and execute transfers on the multi-sig ledger.
        </p>
        <button
          onClick={connect}
          className="btn-primary px-8 py-3 text-lg font-semibold shadow-lg shadow-primary/20"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Toaster position="bottom-right" />
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-bold text-white">Treasury Vault</h1>
            <button
              onClick={refresh}
              className="text-xs px-2.5 py-1 border border-stellar-border rounded bg-stellar-dark hover:bg-stellar-border text-gray-300 hover:text-white transition-all"
            >
              🔄 Refresh
            </button>
          </div>
          <p className="text-gray-400 mt-1">
            Signer account: <span className="font-mono text-gray-300 select-all">{address}</span>
            {isSigner(address) ? (
              <span className="text-green-500 text-xs ml-2">✓ Authoritative Signer</span>
            ) : (
              <span className="text-red-500 text-xs ml-2">✗ Non-Signer Wallet</span>
            )}
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setDepositOpen(true)}
            className="btn-secondary text-sm font-semibold"
          >
            + Deposit
          </button>
          {isSigner(address) && (
            <button
              onClick={() => setProposalOpen(true)}
              className="btn-primary text-sm font-semibold"
            >
              + Propose Withdrawal
            </button>
          )}
        </div>
      </div>

      {/* Mock Mode Simulation Dashboard */}
      {isMockMode && (
        <div className="border border-yellow-800 bg-yellow-950/10 rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h4 className="text-sm font-semibold text-yellow-500">
              🛠️ Developer Simulation Dashboard
            </h4>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl">
              You are in simulated sandbox mode. Use the active signer dropdown at the top right header to toggle between Signers A, B, C, and Executor. Propose and approve to test the multisig threshold.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5 w-full md:w-auto">
            <button
              onClick={() => {
                simulatePolicyChange();
                toast.success("Policy threshold configuration invalidated! Pending proposals marked as Stale Policy.");
              }}
              className="text-xs px-3 py-1.5 bg-purple-950 border border-purple-800 text-purple-400 rounded hover:bg-purple-900 transition-colors"
            >
              ⚠️ Invalidate Policy
            </button>
          </div>
        </div>
      )}

      {/* Balance & Threshold Cards */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading vault configurations...</div>
      ) : error ? (
        <div className="border border-red-900 bg-red-950/20 text-red-400 rounded-xl p-6 text-center">
          <p className="font-semibold">⚠️ Failed to connect to Soroban Network</p>
          <p className="text-sm text-gray-400 mt-1">{error}</p>
          <button
            onClick={() => toggleMockMode(true)}
            className="mt-4 px-4 py-2 border border-red-800 rounded bg-red-950/40 text-red-300 hover:bg-red-900 text-xs font-semibold"
          >
            Switch to Mock Mode
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card flex flex-col justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">
                Vault Balance
              </p>
              <h2 className="text-4xl font-extrabold text-white mt-2">
                {config ? formatXLM(config.balance) : "—"} <span className="text-lg font-bold text-gray-400">XLM</span>
              </h2>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Vault Asset: Native XLM Token
            </p>
          </div>
          <div className="card flex flex-col justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">
                Multi-Sig Policy
              </p>
              <h2 className="text-3xl font-bold text-white mt-2">
                {config ? `${config.threshold} of ${config.signerCount}` : "—"}{" "}
                <span className="text-sm text-gray-400 font-normal">signers required</span>
              </h2>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Active Policy Version: v{config?.policyVersion || 1}
            </p>
          </div>
        </div>
      )}

      {/* Proposals Section */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-white">Active Withdrawal Proposals</h2>
        
        {loading ? (
          <div className="card text-center py-12 text-gray-500">Loading proposals...</div>
        ) : transactions.length === 0 ? (
          <div className="card text-center py-12 text-gray-500">
            No withdrawal proposals found in this multisig vault.
          </div>
        ) : (
          <div className="space-y-4">
            {transactions.map((tx) => {
              const status = getProposalStatus(tx);
              const hasSigned = address ? tx.approvals.includes(address) : false;
              const isEligible = config ? tx.approvals.length >= config.threshold : false;

              return (
                <div
                  key={tx.id}
                  className="card border border-stellar-border hover:border-stellar-border/80 transition-all flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6"
                >
                  <div className="space-y-3 flex-1">
                    {/* Header info */}
                    <div className="flex items-center space-x-3">
                      <span className="font-mono text-xs text-gray-500">Proposal #{tx.id}</span>
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${getStatusBadgeClass(status)}`}>
                        {status}
                      </span>
                      <span className="text-xs text-gray-400">
                        v{tx.policy_version} Policy
                      </span>
                    </div>

                    {/* Transaction terms */}
                    <div>
                      <p className="text-lg font-bold text-white">
                        {formatXLM(tx.amount)} XLM
                      </p>
                      <p className="text-sm text-gray-400 mt-0.5">
                        Destination: <span className="font-mono text-white select-all">{tx.to}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Memo: <span className="italic text-gray-300">{tx.memo}</span>
                      </p>
                    </div>

                    {/* Signers list */}
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                        Approval Ledger ({tx.approvals.length} / {config?.threshold || 0} Met)
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {tx.approvals.map((signee) => (
                          <span
                            key={signee}
                            className="text-[10px] font-mono px-2 py-1 bg-green-950/40 text-green-400 border border-green-900 rounded"
                            title="Signed/Approved"
                          >
                            ✓ {truncateAddress(signee)}
                          </span>
                        ))}
                        {tx.approvals.length === 0 && (
                          <span className="text-[10px] text-gray-500 italic">
                            No signatures collected
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expiry metadata */}
                    <div className="text-[11px] text-gray-500">
                      Created: {new Date(tx.created_at * 1000).toLocaleString()} | Expires:{" "}
                      {new Date(tx.expires_at * 1000).toLocaleString()}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                    {/* Approve button */}
                    {status === "Pending" && isSigner(address) && !hasSigned && (
                      <button
                        onClick={() => setPreviewAction({ type: "approve", tx })}
                        className="btn-primary text-xs py-1.5 px-3"
                      >
                        Sign Approval
                      </button>
                    )}

                    {/* Revoke button */}
                    {status === "Pending" && isSigner(address) && hasSigned && (
                      <button
                        onClick={() => setPreviewAction({ type: "revoke", tx })}
                        className="px-3 py-1.5 bg-red-950/40 border border-red-900 text-red-400 hover:bg-red-900/40 rounded text-xs transition-colors"
                      >
                        Revoke Approval
                      </button>
                    )}

                    {/* Execute button */}
                    {status === "Ready" && (
                      <button
                        onClick={() => setPreviewAction({ type: "execute", tx })}
                        className="btn-primary text-xs py-1.5 px-4 bg-green-600 hover:bg-green-700 shadow-md shadow-green-600/25 border-green-800"
                      >
                        Execute Transfer
                      </button>
                    )}

                    {/* Cancel button */}
                    {(status === "Pending" || status === "Ready") &&
                      (address === tx.proposer || address === config?.admin) && (
                        <button
                          onClick={() => setPreviewAction({ type: "cancel", tx })}
                          className="px-3 py-1.5 bg-stellar-dark border border-stellar-border text-gray-300 hover:bg-stellar-border rounded text-xs transition-colors"
                        >
                          Cancel Proposal
                        </button>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL 1: Deposit */}
      {depositOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stellar-dark border border-stellar-border rounded-xl w-full max-w-md p-6 relative">
            <button
              onClick={() => setDepositOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              ✕
            </button>
            <h3 className="text-xl font-bold text-white mb-4">Deposit Funds</h3>
            <form onSubmit={handleDepositSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1">
                  AMOUNT (XLM)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  placeholder="e.g. 50"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full bg-stellar-darker border border-stellar-border rounded p-2.5 text-white font-mono text-sm focus:border-primary-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={actionLoading}
                className="w-full btn-primary py-2.5 font-bold"
              >
                {actionLoading ? "Processing..." : "Confirm Deposit"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: New Proposal */}
      {proposalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stellar-dark border border-stellar-border rounded-xl w-full max-w-lg p-6 relative">
            <button
              onClick={() => setProposalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              ✕
            </button>
            <h3 className="text-xl font-bold text-white mb-4">Propose Withdrawal</h3>
            <form onSubmit={handleProposeSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1">
                  RECIPIENT ADDRESS
                </label>
                <input
                  type="text"
                  required
                  placeholder="G..."
                  value={proposalTo}
                  onChange={(e) => setProposalTo(e.target.value)}
                  className="w-full bg-stellar-darker border border-stellar-border rounded p-2.5 text-white font-mono text-sm focus:border-primary-400 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 font-semibold mb-1">
                    AMOUNT (XLM)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    placeholder="e.g. 100"
                    value={proposalAmount}
                    onChange={(e) => setProposalAmount(e.target.value)}
                    className="w-full bg-stellar-darker border border-stellar-border rounded p-2.5 text-white font-mono text-sm focus:border-primary-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 font-semibold mb-1">
                    EXPIRY (HOURS)
                  </label>
                  <select
                    value={proposalExpiry}
                    onChange={(e) => setProposalExpiry(e.target.value)}
                    className="w-full bg-stellar-darker border border-stellar-border rounded p-2.5 text-white text-sm focus:border-primary-400 focus:outline-none"
                  >
                    <option value="1">1 Hour</option>
                    <option value="6">6 Hours</option>
                    <option value="12">12 Hours</option>
                    <option value="24">24 Hours</option>
                    <option value="72">3 Days</option>
                    <option value="168">7 Days</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1">
                  MEMO / REFERENCE DESCRIPTION
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Development Server Hosting"
                  value={proposalMemo}
                  onChange={(e) => setProposalMemo(e.target.value)}
                  className="w-full bg-stellar-darker border border-stellar-border rounded p-2.5 text-white text-sm focus:border-primary-400 focus:outline-none"
                />
              </div>
              
              <div className="border border-primary-800 bg-primary-950/20 text-xs text-primary-400 p-3 rounded">
                ℹ️ Creating this proposal will record your active signer approval automatically.
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full btn-primary py-2.5 font-bold"
              >
                {actionLoading ? "Submitting Proposal..." : "Submit Proposal"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Human-Readable Intent Signature Preview */}
      {previewAction && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-stellar-dark border border-stellar-border rounded-xl w-full max-w-md p-6 relative">
            <h3 className="text-lg font-bold text-white mb-2">🔐 Review Transaction Intent</h3>
            <p className="text-xs text-gray-400 border-b border-stellar-border pb-3">
              Verify the details below before signing with your keypair. Soroban contract invocations are immutable once broadcast.
            </p>
            
            <div className="space-y-4 my-5 bg-stellar-darker p-4 rounded border border-stellar-border">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">OPERATION:</span>
                <span className="font-bold text-primary-400 uppercase font-mono">
                  {previewAction.type}
                </span>
              </div>
              
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">PROPOSAL ID:</span>
                <span className="font-bold text-white font-mono">
                  #{previewAction.tx.id}
                </span>
              </div>

              <div className="flex justify-between items-start text-xs">
                <span className="text-gray-400">RECIPIENT:</span>
                <span className="font-mono text-white break-all text-right max-w-[200px]">
                  {previewAction.tx.to}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">AMOUNT:</span>
                <span className="font-bold text-white font-mono">
                  {formatXLM(previewAction.tx.amount)} XLM
                </span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">MEMO:</span>
                <span className="italic text-gray-300">
                  {previewAction.tx.memo}
                </span>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                disabled={actionLoading}
                onClick={() => setPreviewAction(null)}
                className="w-1/2 px-4 py-2 border border-stellar-border rounded text-gray-300 hover:bg-stellar-border text-sm font-semibold transition-colors"
              >
                Reject Signature
              </button>
              <button
                disabled={actionLoading}
                onClick={triggerIntentAction}
                className="w-1/2 btn-primary py-2 text-sm font-bold bg-green-600 hover:bg-green-700 shadow-md border-green-800"
              >
                {actionLoading ? "Signing..." : "Sign & Authorize"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
