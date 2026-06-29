import { SorobanRpc } from '@stellar/stellar-sdk';
import type { Db } from '../db/client';
import type { Config } from '../config';
import { contractIdMap } from '../config';
import { parseEvent } from './parser';
import { handleTreasuryEvent } from './handlers/treasury';
import { handleGovernanceEvent } from './handlers/governance';
import { handleVaultEvent } from './handlers/vault';
import { handleAclEvent } from './handlers/acl';
import { Reconciler } from './reconciler';
import type { RawSorobanEvent, ContractType } from '../types/events';

const RECONCILE_EVERY_N_BATCHES = 12; // ~1 minute at 5s poll

export class Indexer {
  private server: SorobanRpc.Server;
  private contractMap: Map<string, ContractType>;
  private reconciler: Reconciler | null = null;
  private running = false;
  private batchCount = 0;
  private config: Config;

  constructor(private db: Db, config: Config) {
    this.config = config;
    this.server = new SorobanRpc.Server(config.sorobanRpcUrl, {
      allowHttp: config.sorobanRpcUrl.startsWith('http://'),
    });
    this.contractMap = contractIdMap(config);

    if (config.contracts.treasury) {
      this.reconciler = new Reconciler({
        rpcUrl: config.sorobanRpcUrl,
        networkPassphrase: config.networkPassphrase,
        treasuryContractId: config.contracts.treasury,
      });
    }
  }

  async start(): Promise<void> {
    this.running = true;
    console.log('[indexer] Starting event ingestion loop');

    while (this.running) {
      try {
        await this.poll();
      } catch (err) {
        console.error('[indexer] Poll error:', (err as Error).message);
      }
      await sleep(this.config.pollIntervalMs);
    }
  }

  stop(): void {
    this.running = false;
  }

  async poll(): Promise<number> {
    const contractIds = [...this.contractMap.keys()];
    if (contractIds.length === 0) {
      console.warn('[indexer] No contract IDs configured — skipping poll');
      return 0;
    }

    const checkpoint = this.db.getCheckpoint();
    const startLedger = checkpoint
      ? checkpoint.last_ledger + 1
      : Math.max(this.config.startLedger, 1);

    // Fetch up to batchSize events from the RPC
    const eventsResp = await this.server.getEvents({
      startLedger,
      filters: [{ type: 'contract', contractIds }],
      limit: this.config.batchSize,
    });

    const events = eventsResp.events as RawSorobanEvent[];
    if (events.length === 0) {
      return 0;
    }

    let ingested = 0;
    let lastLedger = startLedger;
    let lastEventId: string | null = checkpoint?.last_event_id ?? null;

    // Process in a single DB transaction for atomicity
    this.db.transaction(() => {
      for (const raw of events) {
        const contractType = this.contractMap.get(raw.contractId);
        if (!contractType) continue; // filtered by RPC but double-check

        const result = parseEvent(raw, contractType);

        if (!result.ok) {
          console.warn(`[indexer] Quarantining event ${raw.id}: ${result.reason}`);
          this.db.quarantineEvent({
            eventId: raw.id,
            ledger: parseInt(raw.ledger, 10),
            txHash: raw.txHash ?? raw.id,
            contractId: raw.contractId,
            rawTopics: result.rawTopics,
            rawValue: result.rawValue,
            reason: result.reason,
          });
          continue;
        }

        const { event } = result;

        // Idempotent — skip if already stored
        const inserted = this.db.insertEvent(event);
        if (!inserted) {
          // Already indexed (replay / re-delivery)
          continue;
        }

        // Update derived state
        try {
          this.dispatchHandler(event.contractType, event);
        } catch (err) {
          console.error(`[indexer] Handler error for ${event.eventType}:`, (err as Error).message);
        }

        ingested++;
        lastLedger = Math.max(lastLedger, event.ledger);
        lastEventId = event.rawId;
      }

      if (lastLedger >= startLedger) {
        this.db.upsertCheckpoint(lastLedger, lastEventId);
      }
    });

    console.log(`[indexer] Ledger ${startLedger}→${lastLedger}: ${ingested} new events`);

    this.batchCount++;
    if (this.reconciler && this.batchCount % RECONCILE_EVERY_N_BATCHES === 0) {
      this.reconciler.reconcile(this.db).catch((err) =>
        console.error('[reconciler] Error:', (err as Error).message),
      );
    }

    return ingested;
  }

  private dispatchHandler(contractType: ContractType, event: import('../types/events').ParsedEvent): void {
    switch (contractType) {
      case 'treasury':   return handleTreasuryEvent(this.db, event);
      case 'governance': return handleGovernanceEvent(this.db, event);
      case 'vault':      return handleVaultEvent(this.db, event);
      case 'acl':        return handleAclEvent(this.db, event);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
