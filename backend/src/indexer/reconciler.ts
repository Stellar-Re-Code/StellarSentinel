import { SorobanRpc, xdr, scValToNative, Address } from '@stellar/stellar-sdk';
import type { Db } from '../db/client';

export interface ReconcilerOptions {
  rpcUrl: string;
  networkPassphrase: string;
  treasuryContractId: string;
  onChainBalanceGetter?: () => Promise<{ balance: string; ledger: number }>;
  /** Issue #79 — injected on-chain proposal statuses for reconciliation. */
  onChainProposalStatuses?: () => Promise<Array<{ proposalId: string; status: string }>>;
  /** Issue #79 — injected on-chain vault schedule remainings for reconciliation. */
  onChainVaultRemainings?: () => Promise<Array<{ vaultId: string; remaining: string }>>;
}

export class Reconciler {
  private server: SorobanRpc.Server;
  private opts: ReconcilerOptions;

  constructor(opts: ReconcilerOptions) {
    this.opts = opts;
    this.server = new SorobanRpc.Server(opts.rpcUrl, { allowHttp: opts.rpcUrl.startsWith('http://') });
  }

  async reconcile(db: Db): Promise<void> {
    const indexedBalance = db.getLatestBalance(this.opts.treasuryContractId);

    // Proposal and vault reconciliation run regardless of balance history.
    await this.reconcileProposals(db, db.getCheckpoint()?.last_ledger ?? 0);
    await this.reconcileVaultSchedules(db, db.getCheckpoint()?.last_ledger ?? 0);

    if (indexedBalance === null) {
      return;
    }

    let onChainBalance: string;
    let latestLedger: number;
    try {
      const result = this.opts.onChainBalanceGetter
        ? await this.opts.onChainBalanceGetter()
        : await this.fetchOnChainBalance();
      onChainBalance = result.balance;
      latestLedger = result.ledger;
    } catch (err) {
      db.insertReconciliation({
        contract_id: this.opts.treasuryContractId,
        ledger_sequence: 0,
        indexed_balance: indexedBalance,
        on_chain_balance: '0',
        discrepancy: '0',
        status: 'error',
        detail: `RPC error: ${(err as Error).message}`,
      });
      return;
    }

    const indexed = BigInt(indexedBalance);
    const onChain = BigInt(onChainBalance);
    const discrepancy = onChain - indexed;

    const status = discrepancy === 0n ? 'ok' : 'mismatch';

    db.insertReconciliation({
      contract_id: this.opts.treasuryContractId,
      ledger_sequence: latestLedger,
      indexed_balance: indexedBalance,
      on_chain_balance: onChainBalance,
      discrepancy: String(discrepancy),
      status,
      detail: discrepancy !== 0n
        ? `Indexed balance ${indexedBalance} does not match on-chain balance ${onChainBalance} (delta=${discrepancy})`
        : null,
    });

    if (discrepancy !== 0n) {
      const msg =
        `[reconciler] DIVERGENCE on ${this.opts.treasuryContractId}: ` +
        `indexed=${indexedBalance} on_chain=${onChainBalance} delta=${discrepancy}`;
      console.error(msg);

      db.haltIndexer(
        `Balance divergence: ${msg}. Ledger ${latestLedger}. Remediation required.`,
        latestLedger,
      );

      const gaps = db.getOpenGaps(this.opts.treasuryContractId);
      if (gaps.length > 0) {
        console.error(`[reconciler] Open gaps detected: ${gaps.map((g) => `${g.gap_start}→${g.gap_end}`).join(', ')}`);
      }
    }
  }

  /**
   * Issue #79 — verify indexed proposal statuses against on-chain state and
   * report mismatches with the contract ID and offending proposal identifiers.
   */
  private async reconcileProposals(db: Db, latestLedger: number): Promise<void> {
    if (!this.opts.onChainProposalStatuses) return;

    let onChain: Array<{ proposalId: string; status: string }>;
    try {
      onChain = await this.opts.onChainProposalStatuses();
    } catch (err) {
      db.insertReconciliation({
        contract_id: this.opts.treasuryContractId,
        ledger_sequence: latestLedger,
        indexed_balance: 'n/a',
        on_chain_balance: 'n/a',
        discrepancy: '0',
        status: 'error',
        detail: `Proposal reconciliation RPC error: ${(err as Error).message}`,
      });
      return;
    }

    for (const { proposalId, status } of onChain) {
      const indexed = db.getProposal(this.opts.treasuryContractId, proposalId);
      if (indexed && indexed.status === status) continue;

      const lastEvent = db.getCheckpoint()?.last_event_id ?? 'none';
      db.insertReconciliation({
        contract_id: this.opts.treasuryContractId,
        ledger_sequence: latestLedger,
        indexed_balance: indexed?.status ?? 'missing',
        on_chain_balance: status,
        discrepancy: '1',
        status: 'mismatch',
        detail:
          `Proposal status mismatch — proposal_id=${proposalId} contract_id=${this.opts.treasuryContractId}; ` +
          `indexed='${indexed?.status ?? 'missing'}' on_chain='${status}'; ` +
          `checkpoint_event_id=${lastEvent}`,
      });
      console.error(
        `[reconciler] PROPOSAL MISMATCH ${this.opts.treasuryContractId}#${proposalId}: ` +
        `indexed='${indexed?.status ?? 'missing'}' on_chain='${status}'`,
      );
    }
  }

  /**
   * Issue #79 — verify derived vault schedules (total − claimed) against
   * on-chain remainings and report mismatches with vault identifiers.
   */
  private async reconcileVaultSchedules(db: Db, latestLedger: number): Promise<void> {
    if (!this.opts.onChainVaultRemainings) return;

    let onChain: Array<{ vaultId: string; remaining: string }>;
    try {
      onChain = await this.opts.onChainVaultRemainings();
    } catch (err) {
      db.insertReconciliation({
        contract_id: this.opts.treasuryContractId,
        ledger_sequence: latestLedger,
        indexed_balance: 'n/a',
        on_chain_balance: 'n/a',
        discrepancy: '0',
        status: 'error',
        detail: `Vault reconciliation RPC error: ${(err as Error).message}`,
      });
      return;
    }

    for (const { vaultId, remaining } of onChain) {
      const row = db.getVaultSchedules(this.opts.treasuryContractId)
        .find((v) => v.vault_id === vaultId);
      const indexedRemaining = row
        ? String(BigInt(row.total_amount) - BigInt(row.claimed_amount))
        : null;

      if (indexedRemaining === remaining) continue;

      const discrepancyValue =
        indexedRemaining === null ? 'missing' : String(BigInt(remaining) - BigInt(indexedRemaining));

      db.insertReconciliation({
        contract_id: this.opts.treasuryContractId,
        ledger_sequence: latestLedger,
        indexed_balance: indexedRemaining ?? 'missing',
        on_chain_balance: remaining,
        discrepancy: discrepancyValue,
        status: 'mismatch',
        detail:
          `Vault schedule mismatch — vault_id=${vaultId} contract_id=${this.opts.treasuryContractId}; ` +
          `indexed_remaining='${indexedRemaining ?? 'missing'}' on_chain_remaining='${remaining}'`,
      });
      console.error(
        `[reconciler] VAULT MISMATCH ${this.opts.treasuryContractId}#${vaultId}: ` +
        `indexed_remaining='${indexedRemaining ?? 'missing'}' on_chain_remaining='${remaining}'`,
      );
    }
  }

  private async fetchOnChainBalance(): Promise<{ balance: string; ledger: number }> {
    const contractKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(this.opts.treasuryContractId).toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
      }),
    );

    const resp = await this.server.getLedgerEntries(contractKey);
    if (resp.entries.length === 0) {
      throw new Error('Contract instance not found on-chain');
    }

    const entry = resp.entries[0];
    const ledger = resp.latestLedger;

    const contractData = entry.val.contractData();
    const instance = contractData.val().instance();
    const storage = instance.storage();

    if (!storage) {
      throw new Error('Contract instance has no storage');
    }

    for (const mapEntry of (storage as any || [])) {
      const keyNative = scValToNative(typeof mapEntry.key === 'function' ? mapEntry.key() : mapEntry.key);
      if (keyNative === 'Balance' || (Array.isArray(keyNative) && keyNative[0] === 'Balance')) {
        const balance = scValToNative(typeof mapEntry.val === 'function' ? mapEntry.val() : mapEntry.val);
        return { balance: String(balance as bigint), ledger };
      }
    }

    throw new Error('Balance key not found in contract instance storage');
  }
}
