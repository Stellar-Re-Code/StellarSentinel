import { SorobanRpc, xdr, scValToNative, Address } from '@stellar/stellar-sdk';
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

const RECONCILE_EVERY_N_BATCHES = 12;
const MAX_LEDGER_SKIP_BEFORE_GAP = 5;

export class Indexer {
  private server: SorobanRpc.Server;
  private contractMap: Map<string, ContractType>;
  private reconciler: Reconciler | null = null;
  private running = false;
  private batchCount = 0;
  private config: Config;
  private lastSeenLedgers: Map<string, number> = new Map();

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
        onChainProposalStatuses: () => this.fetchOnChainProposalStatuses(config.contracts.treasury!),
        onChainVaultRemainings: config.contracts.vault
          ? () => this.fetchOnChainVaultRemainings(config.contracts.vault!)
          : undefined,
      });
    }

    for (const cid of this.contractMap.keys()) {
      const maxLedger = this.db.getMaxLedgerSequence(cid);
      if (maxLedger !== null) {
        this.lastSeenLedgers.set(cid, maxLedger);
      }
    }
  }

  async start(): Promise<void> {
    this.running = true;
    
    const checkpoint = this.db.getCheckpoint();
    if (checkpoint) {
      console.log(`[indexer] Starting event ingestion loop — Resuming from durable cursor: Ledger ${checkpoint.last_ledger}`);
    } else {
      console.log(`[indexer] Starting event ingestion loop — No cursor found, starting from config: Ledger ${this.config.startLedger}`);
    }

    while (this.running) {
      try {
        if (this.db.isHalted()) {
          const status = this.db.getIndexerStatus();
          console.error(`[indexer] HALTED: ${status.halt_reason}`);
          await sleep(this.config.pollIntervalMs * 6);
          continue;
        }
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

    if (this.db.isHalted()) {
      return 0;
    }

    const checkpoint = this.db.getCheckpoint();
    const startLedger = checkpoint
      ? checkpoint.last_ledger + 1
      : Math.max(this.config.startLedger, 1);

    // Detect gap from last known ledger
    this.checkForGaps();

    const eventsResp = await this.server.getEvents({
      startLedger,
      filters: [{ type: 'contract', contractIds }],
      limit: this.config.batchSize,
    });

    const events = eventsResp.events as unknown as RawSorobanEvent[];
    if (events.length === 0) {
      return 0;
    }

    let ingested = 0;
    let lastLedger = startLedger;
    let lastEventId: string | null = checkpoint?.last_event_id ?? null;
    let reorgDetected = false;

    this.db.transaction(() => {
      for (const raw of events) {
        const contractType = this.contractMap.get(raw.contractId);
        if (!contractType) continue;

        const eventLedger = parseInt(raw.ledger, 10);

        // Re-org detection: if a ledger < last seen, flag it
        const lastSeen = this.lastSeenLedgers.get(raw.contractId);
        if (lastSeen !== undefined && eventLedger <= lastSeen) {
          const existing = this.db.eventExists(raw.id);
          if (existing) {
            continue;
          }
          reorgDetected = true;
          console.warn(
            `[indexer] Possible re-org: new event at ledger ${eventLedger} ` +
            `(last seen ${lastSeen}) for contract ${raw.contractId}. ` +
            `Event ${raw.id} is new — check for divergent state.`,
          );
        }

        const result = parseEvent(raw, contractType);

        if (!result.ok) {
          console.warn(`[indexer] Quarantining event ${raw.id}: ${result.reason}`);
          this.db.quarantineEvent({
            eventId: raw.id,
            ledger: eventLedger,
            txHash: raw.txHash ?? raw.id,
            contractId: raw.contractId,
            rawTopics: result.rawTopics,
            rawValue: result.rawValue,
            reason: result.reason,
          });
          continue;
        }

        const { event } = result;

        const inserted = this.db.insertEvent(event);
        if (!inserted) {
          continue;
        }

        try {
          this.dispatchHandler(event.contractType, event);
        } catch (err) {
          console.error(`[indexer] Handler error for ${event.eventType}:`, (err as Error).message);
        }

        ingested++;
        lastLedger = Math.max(lastLedger, eventLedger);
        lastEventId = event.rawId;
        this.lastSeenLedgers.set(raw.contractId, Math.max(lastSeen ?? 0, eventLedger));
      }

      if (reorgDetected) {
        console.error('[indexer] RE-ORG DETECTED — scheduling immediate reconciliation');
      }

      if (lastLedger >= startLedger) {
        this.db.upsertCheckpoint(lastLedger, lastEventId);
      }
    });

    console.log(`[indexer] Ledger ${startLedger}→${lastLedger}: ${ingested} new events${reorgDetected ? ' [RE-ORG]' : ''}`);

    this.batchCount++;
    if (this.reconciler && (this.batchCount % RECONCILE_EVERY_N_BATCHES === 0 || reorgDetected)) {
      this.reconciler.reconcile(this.db).catch((err) =>
        console.error('[reconciler] Error:', (err as Error).message),
      );
    }

    return ingested;
  }

  checkForGaps(): void {
    const contractIds = [...this.contractMap.keys()];
    const checkpoint = this.db.getCheckpoint();
    if (!checkpoint) return;

    const startLedger = checkpoint.last_ledger + 1;

    for (const cid of contractIds) {
      const maxSeen = this.lastSeenLedgers.get(cid);
      if (maxSeen !== undefined && startLedger > maxSeen + 1) {
        const gapSize = startLedger - maxSeen - 1;
        if (gapSize > MAX_LEDGER_SKIP_BEFORE_GAP) {
          this.db.detectGap(cid, maxSeen + 1, startLedger - 1);
          console.warn(`[indexer] GAP detected for ${cid}: ledgers ${maxSeen + 1} → ${startLedger - 1} (${gapSize} ledgers)`);
        }
      }
    }
  }

  setLastSeenLedger(contractId: string, ledger: number): void {
    this.lastSeenLedgers.set(contractId, ledger);
  }

  getLastSeenLedger(contractId: string): number | undefined {
    return this.lastSeenLedgers.get(contractId);
  }

  private dispatchHandler(contractType: ContractType, event: import('../types/events').ParsedEvent): void {
    switch (contractType) {
      case 'treasury':   return handleTreasuryEvent(this.db, event);
      case 'governance': return handleGovernanceEvent(this.db, event);
      case 'vault':      return handleVaultEvent(this.db, event);
      case 'acl':        return handleAclEvent(this.db, event);
    }
  }

  /**
   * RPC-backed getter: read proposal statuses from the on-chain treasury
   * contract storage so the Reconciler can verify indexed state.
   */
  private async fetchOnChainProposalStatuses(
    treasuryContractId: string,
  ): Promise<Array<{ proposalId: string; status: string }>> {
    // TxCounter lives in contract instance storage (not a standalone persistent key).
    // Read the full contract instance and extract TxCounter from its storage map.
    const contractKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(treasuryContractId).toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
      }),
    );

    const resp = await this.server.getLedgerEntries(contractKey);
    if (resp.entries.length === 0) return [];

    const contractData = resp.entries[0].val.contractData();
    const instance = contractData.val().instance();
    const storage = instance.storage();

    if (!storage) return [];

    // Find TxCounter in instance storage
    let txCount = 0;
    for (const mapEntry of storage as any) {
      const keyNative = scValToNative(typeof mapEntry.key === 'function' ? mapEntry.key() : mapEntry.key);
      if (keyNative === 'TxCounter') {
        const val = scValToNative(typeof mapEntry.val === 'function' ? mapEntry.val() : mapEntry.val);
        txCount = typeof val === 'bigint' ? Number(val) : Number(val);
        break;
      }
    }

    if (txCount === 0) return [];

    const results: Array<{ proposalId: string; status: string }> = [];
    // Batch-read proposals (limit to 200 to avoid huge RPC payloads).
    const batchSize = 50;
    for (let start = 1; start <= txCount && start <= 200; start += batchSize) {
      const keys: xdr.LedgerKey[] = [];
      const ids: number[] = [];
      for (let i = start; i < Math.min(start + batchSize, txCount + 1) && i <= 200; i++) {
        keys.push(
          xdr.LedgerKey.contractData(
            new xdr.LedgerKeyContractData({
              contract: new Address(treasuryContractId).toScAddress(),
              key: xdr.ScVal.scvVec([
                xdr.ScVal.scvSymbol('Transaction'),
                xdr.ScVal.scvU32(i),
              ]),
              durability: xdr.ContractDataDurability.persistent(),
            }),
          ),
        );
        ids.push(i);
      }

      const batch = await this.server.getLedgerEntries(...keys);
      for (let j = 0; j < batch.entries.length; j++) {
        const entry = batch.entries[j];
        const val = scValToNative(entry.val.contractData().val()) as Record<string, unknown>;
        const executed = val.executed === true || val.executed === 1;
        const canceled = val.canceled === true || val.canceled === 1;
        const status = canceled ? 'canceled' : executed ? 'executed' : 'proposed';
        results.push({ proposalId: String(ids[j]), status });
      }
    }

    return results;
  }

  /**
   * RPC-backed getter: read vault remaining amounts from the on-chain vault
   * contract storage so the Reconciler can verify indexed derived state.
   */
  private async fetchOnChainVaultRemainings(
    vaultContractId: string,
  ): Promise<Array<{ vaultId: string; remaining: string }>> {
    // Read the vault's persistent storage for locked/remaining amounts.
    // The vault contract stores DataKey::Locked(vault_id) as i128.
    // We scan the DB for known vault IDs and read each from chain.
    const vaultSchedules = this.db.getVaultSchedules(vaultContractId);
    if (vaultSchedules.length === 0) return [];

    const results: Array<{ vaultId: string; remaining: string }> = [];
    const batchSize = 20;
    for (let i = 0; i < vaultSchedules.length; i += batchSize) {
      const batch = vaultSchedules.slice(i, i + batchSize);
      const keys: xdr.LedgerKey[] = [];
      for (const v of batch) {
        keys.push(
          xdr.LedgerKey.contractData(
            new xdr.LedgerKeyContractData({
              contract: new Address(vaultContractId).toScAddress(),
              key: xdr.ScVal.scvVec([
                xdr.ScVal.scvSymbol('Locked'),
                xdr.ScVal.scvString(v.vault_id),
              ]),
              durability: xdr.ContractDataDurability.persistent(),
            }),
          ),
        );
      }

      try {
        const resp = await this.server.getLedgerEntries(...keys);
        for (let j = 0; j < resp.entries.length; j++) {
          const val = scValToNative(resp.entries[j].val.contractData().val());
          results.push({
            vaultId: batch[j].vault_id,
            remaining: String(val as bigint),
          });
        }
      } catch {
        // Vault contract may not be deployed or may have different storage
        // layout — skip this batch and let reconciliation report missing data.
      }
    }

    return results;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
