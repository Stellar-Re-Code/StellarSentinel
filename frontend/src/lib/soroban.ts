import { 
  Contract, 
  SorobanRpc, 
  TransactionBuilder, 
  Networks, 
  xdr, 
  Address,
  nativeToScVal
} from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { SOROBAN_RPC_URL, NETWORK_PASSPHRASE } from "./network";

// ============================================================================
// Contract IDs
// ============================================================================

export const CONTRACT_IDS = {
  treasury: process.env.NEXT_PUBLIC_TREASURY_CONTRACT_ID || "CD2M7R6E55D36VTR2C5BIPNGB6W6KUX5IAJTGKIN2ER7LBNVKOCCWAAA", // Example testnet ID
} as const;

// ============================================================================
// Soroban RPC Helpers
// ============================================================================

/**
 * Get a Soroban RPC server instance.
 */
export function getRpcServer(): SorobanRpc.Server {
  return new SorobanRpc.Server(SOROBAN_RPC_URL);
}

/**
 * Build a Soroban contract invocation transaction.
 */
export async function buildContractCall(
  contractId: string,
  method: string,
  args: any[],
  sourceAddress: string
): Promise<string> {
  const server = getRpcServer();
  const account = await server.getAccount(sourceAddress);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simulated)) {
    throw new Error(`Simulation failed: ${simulated.error}`);
  }
  
  const assembledTx = SorobanRpc.assembleTransaction(tx, simulated) as any;
  return assembledTx.toXDR();
}

/**
 * Sign a transaction using Freighter wallet and submit to network.
 */
export async function signAndSubmit(
  xdrString: string,
  userAddress: string
): Promise<string> {
  const signedXDR = await signTransaction(xdrString, {
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  const server = getRpcServer();
  const tx = TransactionBuilder.fromXDR(signedXDR, NETWORK_PASSPHRASE);
  
  const sendResponse = await server.sendTransaction(tx);
  if (sendResponse.status === "ERROR") {
    throw new Error(`Transaction sending failed: ${JSON.stringify(sendResponse.errorResult)}`);
  }

  // Poll for transaction result
  let txHash = sendResponse.hash;
  let attempts = 0;
  while (attempts < 10) {
    const statusResponse = await server.getTransaction(txHash);
    if (statusResponse.status === "SUCCESS") {
      return txHash;
    } else if (statusResponse.status === "FAILED") {
      throw new Error(`Transaction execution failed: ${JSON.stringify(statusResponse.resultXdr)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempts++;
  }
  
  throw new Error("Transaction confirmation timed out");
}

/**
 * Read a value from a Soroban contract (no signing required).
 */
export async function readContractValue(
  contractId: string,
  method: string,
  args: any[] = []
): Promise<any> {
  const server = getRpcServer();
  const contract = new Contract(contractId);
  
  // Use a dummy source address for simulation
  const dummySource = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";
  const account = await server.getAccount(dummySource);
  
  const tx = new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simulated)) {
    throw new Error(`Simulation failed: ${simulated.error}`);
  }

  if (simulated.result) {
    // Return parsed result if available
    return simulated.result.retval;
  }
  return null;
}
