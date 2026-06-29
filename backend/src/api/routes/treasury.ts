import { Router, Request, Response } from 'express';
import type { Db } from '../../db/client';
import type { ProposalStatus, ProposalHistoryEntry, TreasuryAuditView } from '../../types/models';

export function treasuryRouter(db: Db): Router {
  const router = Router();

  // GET /api/treasury/:contractId/balance
  router.get('/:contractId/balance', (req: Request, res: Response) => {
    const { contractId } = req.params;
    const balance = db.getLatestBalance(contractId);
    const lastReconciliation = db.getLatestReconciliation(contractId);
    res.json({
      contractId,
      indexedBalance: balance ?? '0',
      lastReconciliation: lastReconciliation ?? null,
    });
  });

  // GET /api/treasury/:contractId/proposals
  // ?status=proposed|approved|executed|canceled|expired|stale_policy|revoked
  // ?limit=50&offset=0
  router.get('/:contractId/proposals', (req: Request, res: Response) => {
    const { contractId } = req.params;
    const status = req.query['status'] as ProposalStatus | undefined;
    const limit = Math.min(parseInt(String(req.query['limit'] ?? '50'), 10), 200);
    const offset = parseInt(String(req.query['offset'] ?? '0'), 10);

    const proposals = db.listProposals(contractId, status, limit, offset);
    res.json({ contractId, proposals, limit, offset });
  });

  // GET /api/treasury/:contractId/proposals/:proposalId
  router.get('/:contractId/proposals/:proposalId', (req: Request, res: Response) => {
    const { contractId, proposalId } = req.params;

    const proposal = db.getProposal(contractId, proposalId);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    const approvals = db.getApprovals(contractId, proposalId);
    const events = db.getEventsByProposal(contractId, proposalId);

    const entry: ProposalHistoryEntry = {
      proposalId: proposal.proposal_id,
      contractId: proposal.contract_id,
      proposer: proposal.proposer,
      toAddress: proposal.to_address,
      amount: proposal.amount,
      status: proposal.status,
      policyVersion: proposal.policy_version,
      ledgerProposed: proposal.ledger_proposed,
      ledgerClosed: proposal.ledger_closed ?? null,
      createdAt: proposal.created_at,
      approvals: approvals.map((a) => ({
        signer: a.signer,
        approvalCount: a.approval_count,
        ledgerSequence: a.ledger_sequence,
        revoked: a.revoked === 1,
      })),
      events: events.map((e) => ({
        eventId: e.event_id,
        ledger: e.ledger_sequence,
        ledgerTimestamp: e.ledger_timestamp,
        txHash: e.tx_hash,
        eventType: e.event_type,
        actor: e.actor,
        amount: e.amount,
        lifecycleStatus: e.lifecycle_status,
        rawValue: JSON.parse(e.raw_value),
      })),
    };

    res.json(entry);
  });

  // GET /api/treasury/:contractId/history/balance
  router.get('/:contractId/history/balance', (req: Request, res: Response) => {
    const { contractId } = req.params;
    const limit = Math.min(parseInt(String(req.query['limit'] ?? '100'), 10), 500);
    const offset = parseInt(String(req.query['offset'] ?? '0'), 10);

    const history = db.getBalanceHistory(contractId, limit, offset);
    res.json({
      contractId,
      history: history.map((r) => ({
        ledgerSequence: r.ledger_sequence,
        eventType: r.event_type,
        actor: r.actor,
        amount: r.amount,
        newBalance: r.new_balance,
        proposalId: r.proposal_id,
      })),
    });
  });

  // GET /api/treasury/:contractId/audit
  router.get('/:contractId/audit', (req: Request, res: Response) => {
    const { contractId } = req.params;

    const balance = db.getLatestBalance(contractId);
    const lastReconciliation = db.getLatestReconciliation(contractId);
    const balanceHistory = db.getBalanceHistory(contractId, 20, 0);
    const openProposals = [
      ...db.listProposals(contractId, 'proposed', 100, 0),
      ...db.listProposals(contractId, 'approved', 100, 0),
    ];

    const view: TreasuryAuditView = {
      contractId,
      currentIndexedBalance: balance ?? '0',
      lastReconciliation: lastReconciliation ?? null,
      balanceHistory: balanceHistory.map((r) => ({
        ledgerSequence: r.ledger_sequence,
        eventType: r.event_type,
        actor: r.actor,
        amount: r.amount,
        newBalance: r.new_balance,
        proposalId: r.proposal_id,
      })),
      openProposals,
    };

    res.json(view);
  });

  // GET /api/treasury/:contractId/events
  // ?actor=<address>&limit=100&offset=0
  router.get('/:contractId/events', (req: Request, res: Response) => {
    const { contractId } = req.params;
    const actor = req.query['actor'] as string | undefined;
    const limit = Math.min(parseInt(String(req.query['limit'] ?? '100'), 10), 500);
    const offset = parseInt(String(req.query['offset'] ?? '0'), 10);

    const events = actor
      ? db.getEventsByActor(actor, limit, offset).filter((e) => e.contract_id === contractId)
      : db.getEventsByContract(contractId, limit, offset);

    res.json({
      contractId,
      events: events.map((e) => ({
        eventId: e.event_id,
        ledger: e.ledger_sequence,
        ledgerTimestamp: e.ledger_timestamp,
        txHash: e.tx_hash,
        eventType: e.event_type,
        actor: e.actor,
        amount: e.amount,
        lifecycleStatus: e.lifecycle_status,
        proposalId: e.proposal_id,
      })),
    });
  });

  return router;
}
