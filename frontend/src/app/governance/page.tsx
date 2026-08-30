"use client";

import { ProposalCard } from "@/components/ProposalCard";
import { useGovernance } from "@/hooks/useGovernance";

export default function GovernancePage() {
  const { proposals, hasMore, loading, loadingMore, error, refresh, loadMore } = useGovernance();

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Governance</h1>
          <p className="text-gray-400 mt-1">
            Create and vote on proposals for your organization
          </p>
        </div>
        {/* TODO: [FE-14] Add Create Proposal Modal trigger */}
        <button className="btn-primary">+ New Proposal</button>
      </div>

      {/* Governance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-sm text-gray-400">Total Proposals</p>
          <p className="text-2xl font-bold text-white mt-1">—</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-400">Active</p>
          <p className="text-2xl font-bold text-green-400 mt-1">—</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-400">Quorum %</p>
          <p className="text-2xl font-bold text-primary-400 mt-1">—</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-400">Members</p>
          <p className="text-2xl font-bold text-white mt-1">—</p>
        </div>
      </div>

      {/* TODO: [FE-16] Add vote casting UI */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">
          Active Proposals
        </h2>
        <div className="space-y-4">
          {loading && <div className="card text-center py-8 text-gray-500">Loading proposals...</div>}
          {error && (
            <div className="card text-center py-8 text-red-400">
              <p>{error}</p>
              <button className="btn-primary mt-4" onClick={() => void refresh()}>Retry</button>
            </div>
          )}
          {!loading && !error && proposals.length === 0 && (
            <div className="card text-center py-8 text-gray-500">No proposals found.</div>
          )}
          {proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              id={proposal.id}
              title={proposal.title}
              description={proposal.description}
              status={proposal.status}
              votesFor={proposal.votesFor}
              votesAgainst={proposal.votesAgainst}
              proposer={proposal.proposer}
            />
          ))}
          {!loading && !error && hasMore && (
            <button className="btn-secondary w-full" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? "Loading proposals..." : "Load more proposals"}
            </button>
          )}
        </div>
      </div>

      {/* Past Proposals */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">
          Past Proposals
        </h2>
        <div className="card">
          <p className="text-gray-500 text-center py-8">
            No past proposals
          </p>
        </div>
      </div>
    </div>
  );
}
