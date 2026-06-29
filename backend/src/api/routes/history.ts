import { Router, Request, Response } from 'express';
import type { Db } from '../../db/client';

export function historyRouter(db: Db): Router {
  const router = Router();

  // GET /api/history/account/:address — all events where actor = address
  router.get('/account/:address', (req: Request, res: Response) => {
    const { address } = req.params;
    const limit = Math.min(parseInt(String(req.query['limit'] ?? '100'), 10), 500);
    const offset = parseInt(String(req.query['offset'] ?? '0'), 10);

    const events = db.getEventsByActor(address, limit, offset);
    res.json({
      address,
      events: events.map((e) => ({
        eventId: e.event_id,
        ledger: e.ledger_sequence,
        ledgerTimestamp: e.ledger_timestamp,
        txHash: e.tx_hash,
        contractId: e.contract_id,
        contractType: e.contract_type,
        eventType: e.event_type,
        amount: e.amount,
        lifecycleStatus: e.lifecycle_status,
        proposalId: e.proposal_id,
      })),
      limit,
      offset,
    });
  });

  // GET /api/history/quarantine — quarantined (malformed/unknown) events
  router.get('/quarantine', (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query['limit'] ?? '50'), 10), 200);
    const offset = parseInt(String(req.query['offset'] ?? '0'), 10);

    const events = db.getQuarantinedEvents(limit, offset);
    res.json({ events, limit, offset });
  });

  // GET /api/history/checkpoint — current indexer checkpoint
  router.get('/checkpoint', (_req: Request, res: Response) => {
    const checkpoint = db.getCheckpoint();
    res.json(checkpoint ?? { lastLedger: 0, lastEventId: null });
  });

  return router;
}
