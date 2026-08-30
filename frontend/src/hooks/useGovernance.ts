"use client";

import { useCallback, useEffect, useState } from "react";
import { nativeToScVal, scValToNative } from "@stellar/stellar-sdk";
import { CONTRACT_IDS, readContractValue } from "@/lib/soroban";

const PAGE_SIZE = 10;

export interface GovernanceProposal {
  id: number;
  title: string;
  description: string;
  status: "Active" | "Passed" | "Rejected" | "Executed" | "Expired";
  votesFor: number;
  votesAgainst: number;
  proposer: string;
  votingEnded: boolean;
  executionEligible: boolean;
}

interface ProposalPage {
  proposals: GovernanceProposal[];
  nextCursor: number | null;
}

function decodeProposalPage(value: unknown): ProposalPage {
  const page = scValToNative(value as Parameters<typeof scValToNative>[0]) as {
    proposals: Array<{
      proposal: {
        id: bigint | number;
        title: string;
        description: string;
        status: string | [string];
        votes_for: number;
        votes_against: number;
        proposer: string;
      };
      voting_ended: boolean;
      execution_eligible: boolean;
    }>;
    next_cursor: bigint | number;
  };
  const nextCursor = Number(page.next_cursor);

  return {
    proposals: page.proposals.map(({ proposal, voting_ended, execution_eligible }) => {
      const status = Array.isArray(proposal.status) ? proposal.status[0] : proposal.status;
      return {
        id: Number(proposal.id),
        title: String(proposal.title),
        description: String(proposal.description),
        status: status as GovernanceProposal["status"],
        votesFor: Number(proposal.votes_for),
        votesAgainst: Number(proposal.votes_against),
        proposer: String(proposal.proposer),
        votingEnded: voting_ended,
        executionEligible: execution_eligible,
      };
    }),
    nextCursor: nextCursor === 0 ? null : nextCursor,
  };
}

/**
 * Hook for interacting with the Governance contract.
 *
 * TODO: Implement these functions:
 * - getConfig(): Fetch governance config
 * - getProposal(id): Fetch a specific proposal
 * - createProposal(title, description, action, amount, target): Create new proposal
 * - vote(proposalId, voteFor): Cast a vote
 * - finalize(proposalId): Finalize a completed proposal
 * - executeProposal(proposalId): Execute a passed proposal
 * - hasVoted(proposalId): Check if current user voted
 * - getMembers(): List all DAO members
 */
export function useGovernance() {
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (cursor: number, append: boolean) => {
    if (!CONTRACT_IDS.governance) {
      throw new Error("Governance contract ID is not configured.");
    }
    const value = await readContractValue(CONTRACT_IDS.governance, "list_proposals", [
      nativeToScVal(BigInt(cursor), { type: "u64" }),
      nativeToScVal(PAGE_SIZE, { type: "u32" }),
    ]);
    const page = decodeProposalPage(value);
    setProposals((current) => append ? [...current, ...page.proposals] : page.proposals);
    setNextCursor(page.nextCursor);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadPage(0, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load proposals.");
      setProposals([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      await loadPage(nextCursor, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more proposals.");
    } finally {
      setLoadingMore(false);
    }
  }, [loadPage, loadingMore, nextCursor]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const getConfig = async () => {
    // TODO: Read governance config from Soroban
    return {
      admin: "",
      memberCount: 0,
      quorumPercent: 50,
      votingPeriod: 1000,
      proposalCount: 0,
    };
  };

  const getProposal = async (id: number) => {
    // TODO: [FE-19] Build XDR for getProposal() contract call
    return null;
  };

  const createProposal = async (
    title: string,
    description: string,
    action: string,
    amount: number,
    target: string
  ): Promise<number> => {
    // TODO: [FE-19] Build XDR for createProposal() contract call
    throw new Error("Not implemented — see issue FE-19");
  };

  const vote = async (
    proposalId: number,
    voteFor: boolean
  ): Promise<void> => {
    // TODO: [FE-19] Build XDR for vote() contract call
    throw new Error("Not implemented — see issue FE-19");
  };

  const finalize = async (proposalId: number): Promise<string> => {
    // TODO: [FE-19] Build XDR for finalize() contract call
    throw new Error("Not implemented — see issue FE-19");
  };

  const hasVoted = async (proposalId: number): Promise<boolean> => {
    // TODO: [FE-19] Build XDR for hasVoted() query
    return false;
  };

  return {
    proposals,
    hasMore: nextCursor !== null,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
    getConfig,
    getProposal,
    createProposal,
    vote,
    finalize,
    hasVoted,
  };
}
