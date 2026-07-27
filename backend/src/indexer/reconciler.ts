import { SorobanRpc, xdr, scValToNative, Address } from '@stellar/stellar-sdk';
import type { Db } from '../db/client';

export interface ReconcilerOptions {
  rpcUrl: string;
  networkPassphrase: string;
  treasuryContractId: string;
  onChainBalanceGetter?: () => Promise<{ balance: string; ledger: number }>;
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

    for (const mapEntry of storage.entries()) {
      const keyNative = scValToNative(mapEntry.key());
      if (keyNative === 'Balance' || (Array.isArray(keyNative) && keyNative[0] === 'Balance')) {
        const balance = scValToNative(mapEntry.val());
        return { balance: String(balance as bigint), ledger };
      }
    }

    throw new Error('Balance key not found in contract instance storage');
  }
}
