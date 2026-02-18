// TODO: [FE-16] Implement real vote casting with Soroban

interface VoteButtonProps {
  /** Proposal ID */
  proposalId: number;
  /** Vote direction */
  voteFor: boolean;
  /** Whether the user has already voted */
  hasVoted?: boolean;
  /** Whether voting is closed */
  votingClosed?: boolean;
  /** Callback when vote is submitted */
  onVote?: (proposalId: number, voteFor: boolean) => Promise<void>;
}

/**
 * Button component for casting votes on governance proposals.
 * Handles loading states, disabled states, and visual feedback.
 */
export function VoteButton({
  proposalId,
  voteFor,
  hasVoted = false,
  votingClosed = false,
  onVote,
}: VoteButtonProps) {
  const isDisabled = hasVoted || votingClosed;

  const label = voteFor ? "✅ Vote For" : "❌ Vote Against";
  const disabledLabel = hasVoted
    ? "Already Voted"
    : votingClosed
      ? "Voting Closed"
      : label;

  const baseClass = voteFor
    ? "btn-primary"
    : "btn-secondary border-red-700 hover:bg-red-900/30";

  const handleClick = async () => {
    if (isDisabled || !onVote) return;

    try {
      // TODO: [FE-19] Build XDR transaction for governance vote
      // const tx = await buildVoteTransaction(proposalId, voteFor);
      // await signAndSubmit(tx);
      await onVote(proposalId, voteFor);
    } catch (err) {
      console.error("Vote failed:", err);
    }
  };

  return (
    <button
      className={`${baseClass} flex-1 py-3 ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
      disabled={isDisabled}
      onClick={handleClick}
    >
      {isDisabled ? disabledLabel : label}
    </button>
  );
}
