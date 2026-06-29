import { SorobanRpc, xdr, scValToNative, Address, TransactionBuilder, Networks, Account, Contract, nativeToScVal } from '@stellar/stellar-sdk';
import type { Db } from '../db/client';

export interface ReconcilerOptions {
  rpcUrl: string;
  networkPassphrase: string;
  treasuryContractId: string;
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
      // No events yet — nothing to reconcile
      return;
    }

    let onChainBalance: string;
    let latestLedger: number;
    try {
      const result = await this.fetchOnChainBalance();
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

    db.insertReconciliation({
      contract_id: this.opts.treasuryContractId,
      ledger_sequence: latestLedger,
      indexed_balance: indexedBalance,
      on_chain_balance: onChainBalance,
      discrepancy: String(discrepancy),
      status: discrepancy === 0n ? 'ok' : 'mismatch',
      detail: discrepancy !== 0n
        ? `Indexed balance ${indexedBalance} does not match on-chain balance ${onChainBalance}`
        : null,
    });

    if (discrepancy !== 0n) {
      console.error(
        `[reconciler] MISMATCH on ${this.opts.treasuryContractId}: ` +
        `indexed=${indexedBalance} on_chain=${onChainBalance} delta=${discrepancy}`,
      );
    }
  }

  private async fetchOnChainBalance(): Promise<{ balance: string; ledger: number }> {
    // Read the contract instance ledger entry to extract the Balance key.
    // The balance is stored in instance storage under DataKey::Balance.
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

    // Decode the contract instance data to find the Balance field
    const contractData = entry.val.contractData();
    const instance = contractData.val().instance();
    const storage = instance.storage();

    if (!storage) {
      throw new Error('Contract instance has no storage');
    }

    // Find the key matching DataKey::Balance — it serializes as ScvVec([ScvSymbol("Balance")])
    // In Soroban the contracttype enum variant is stored as a ScVec with the variant name
    for (const mapEntry of storage.entries()) {
      const keyNative = scValToNative(mapEntry.key());
      // DataKey::Balance serializes as the symbol "Balance"
      if (keyNative === 'Balance' || (Array.isArray(keyNative) && keyNative[0] === 'Balance')) {
        const balance = scValToNative(mapEntry.val());
        return { balance: String(balance as bigint), ledger };
      }
    }

    throw new Error('Balance key not found in contract instance storage');
  }
}
