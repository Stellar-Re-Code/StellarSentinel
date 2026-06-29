import type { Db } from '../../db/client';
import type { ParsedEvent } from '../../types/events';

export function handleTreasuryEvent(db: Db, event: ParsedEvent): void {
  const { eventType, contractId, ledger, ledgerTimestamp, rawValue } = event;
  const v = rawValue as unknown[];

  switch (eventType) {
    case 'deposit': {
      // v = [from, amount, new_balance]
      db.insertBalanceHistory({
        contract_id: contractId,
        ledger_sequence: ledger,
        event_type: 'deposit',
        actor: event.actor,
        amount: String(v[1] as bigint),
        new_balance: String(v[2] as bigint),
        proposal_id: null,
      });
      break;
    }

    case 'propose': {
      // v = [tx_id, proposer, to, amount]
      const txId = String(v[0] as bigint);
      db.upsertProposal({
        proposal_id: txId,
        contract_id: contractId,
        proposer: String(v[1]),
        to_address: String(v[2]),
        amount: String(v[3] as bigint),
        policy_version: null,
        status: 'proposed',
        ledger_proposed: ledger,
        created_at: ledgerTimestamp,
      });
      // Proposer counts as first approval
      db.upsertApproval({
        proposal_id: txId,
        contract_id: contractId,
        signer: String(v[1]),
        approval_count: 1,
        ledger_sequence: ledger,
        revoked: 0,
      });
      break;
    }

    case 'approve': {
      // v = [tx_id, signer, approval_count]
      const txId = String(v[0] as bigint);
      db.upsertApproval({
        proposal_id: txId,
        contract_id: contractId,
        signer: String(v[1]),
        approval_count: typeof v[2] === 'number' ? v[2] : Number(v[2]),
        ledger_sequence: ledger,
        revoked: 0,
      });
      db.updateProposalStatus(contractId, txId, 'approved');
      break;
    }

    case 'execute': {
      // v = [tx_id, to, amount, new_balance]
      const txId = String(v[0] as bigint);
      db.updateProposalStatus(contractId, txId, 'executed', ledger);
      db.insertBalanceHistory({
        contract_id: contractId,
        ledger_sequence: ledger,
        event_type: 'execute',
        actor: String(v[1]),
        amount: String(v[2] as bigint),
        new_balance: String(v[3] as bigint),
        proposal_id: txId,
      });
      break;
    }

    case 'revoke': {
      // v = [tx_id, signer, approval_count]
      const txId = String(v[0] as bigint);
      db.revokeApproval(contractId, txId, String(v[1]), ledger);
      // If approval count drops below threshold we mark as revoked (best-effort;
      // exact threshold isn't tracked here — reconciliation will confirm)
      db.updateProposalStatus(contractId, txId, 'revoked');
      break;
    }

    case 'cancel': {
      // v = [tx_id, caller]
      const txId = String(v[0] as bigint);
      db.updateProposalStatus(contractId, txId, 'canceled', ledger);
      break;
    }

    // Signer and threshold changes bump policy_version in the contract —
    // mark any open proposals as stale_policy (they become invalid on-chain).
    case 'add_sig':
    case 'rem_sig':
    case 'thresh': {
      markOpenProposalsStale(db, contractId, ledger);
      break;
    }

    // init and admin require no derived state updates
    default:
      break;
  }
}

function markOpenProposalsStale(db: Db, contractId: string, ledger: number): void {
  const open = db.listProposals(contractId, 'proposed', 1000, 0);
  for (const p of open) {
    db.updateProposalStatus(contractId, p.proposal_id, 'stale_policy', ledger);
  }
  const approved = db.listProposals(contractId, 'approved', 1000, 0);
  for (const p of approved) {
    db.updateProposalStatus(contractId, p.proposal_id, 'stale_policy', ledger);
  }
}
