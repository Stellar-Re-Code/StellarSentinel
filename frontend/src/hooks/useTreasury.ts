// TODO: [FE-20] Implement data fetching with real Soroban RPC calls

/**
 * Hook for interacting with the Treasury contract.
 *
 * TODO: Implement these functions:
 * - getBalance(): Fetch treasury balance
 * - getConfig(): Fetch treasury config (threshold, signer count)
 * - deposit(amount): Build and submit deposit transaction
 * - proposeWithdrawal(to, amount, memo): Create withdrawal proposal
 * - approve(txId): Approve a pending transaction
 * - execute(txId): Execute an approved transaction
 * - getTransaction(txId): Fetch a specific transaction
 * - getSigners(): List all signers
 */
export function useTreasury() {
  // TODO: Import and use Soroban contract client from lib/soroban.ts

  const getBalance = async (): Promise<number> => {
    // TODO: [FE-12] Build XDR for getBalance() contract call
    // const result = await contract.getBalance();
    // return Number(result);
    return 0;
  };

  const getConfig = async () => {
    // TODO: Read treasury config from Soroban
    return {
      admin: "",
      threshold: 0,
      signerCount: 0,
      balance: 0,
      txCount: 0,
    };
  };

  const deposit = async (amount: number): Promise<void> => {
    // TODO: [FE-12] Build XDR for deposit() contract call
    // 1. Build transaction
    // 2. Sign with Freighter
    // 3. Submit to network
    throw new Error("Not implemented — see issue FE-12");
  };

  const proposeWithdrawal = async (
    to: string,
    amount: number,
    memo: string
  ): Promise<number> => {
    // TODO: [FE-12] Build XDR for proposeWithdrawal() contract call
    throw new Error("Not implemented — see issue FE-12");
  };

  const approve = async (txId: number): Promise<void> => {
    // TODO: [FE-12] Build XDR for approve() contract call
    throw new Error("Not implemented — see issue FE-12");
  };

  const execute = async (txId: number): Promise<void> => {
    // TODO: [FE-12] Build XDR for execute() contract call
    throw new Error("Not implemented — see issue FE-12");
  };

  return {
    getBalance,
    getConfig,
    deposit,
    proposeWithdrawal,
    approve,
    execute,
  };
}
