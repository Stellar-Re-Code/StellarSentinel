import { 
  Contract, 
  SorobanRpc, 
  TransactionBuilder, 
  xdr, 
  Address,
  nativeToScVal,
  scValToNative
} from "@stellar/stellar-sdk";
import { signTransaction } from "@stellar/freighter-api";
import { SOROBAN_RPC_URL, NETWORK_PASSPHRASE } from "./network";

// ============================================================================
// Contract IDs
// ============================================================================

export const CONTRACT_IDS = {
  treasury: process.env.NEXT_PUBLIC_TREASURY_CONTRACT_ID || "",
  governance: process.env.NEXT_PUBLIC_GOVERNANCE_CONTRACT_ID || "",
} as const;

/**
 * Validate that a contract ID is configured and not an example/placeholder.
 */
export function validateContractId(contractId: string, name: string = "Contract"): void {
  if (
    !contractId ||
    contractId.trim().length === 0 ||
    contractId.includes("PLACEHOLDER") ||
    contractId === "CD2M7R6E55D36VTR2C5BIPNGB6W6KUX5IAJTGKIN2ER7LBNVKOCCWAAA"
  ) {
    throw new Error(`${name} contract ID is not configured. Live mode requires an active Soroban deployment.`);
  }
}

// ============================================================================
// Soroban Type Encoding Helpers
// ============================================================================

export function encodeAddress(addr: string): xdr.ScVal {
  return new Address(addr).toScVal();
}

export function encodeI128(val: number | bigint | string): xdr.ScVal {
  return nativeToScVal(BigInt(val), { type: "i128" });
}

export function encodeU32(val: number): xdr.ScVal {
  return nativeToScVal(val, { type: "u32" });
}

export function encodeU64(val: number | bigint): xdr.ScVal {
  return nativeToScVal(BigInt(val), { type: "u64" });
}

export function encodeString(val: string): xdr.ScVal {
  return nativeToScVal(val, { type: "string" });
}

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
 * Build a Soroban contract invocation transaction with typed ScVal arguments
 * and filtered authorization entries.
 */
export async function buildContractCall(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  sourceAddress: string
): Promise<string> {
  validateContractId(contractId, "Treasury");
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

  // Filter authorization entries to connected account
  const authEntries = (simulated as any).auth || [];
  if (authEntries.length > 0) {
    const isAuthorized = authEntries.every((entry: any) => {
      try {
        const credentials = entry.credentials();
        if (credentials.switch().name === "sorobanCredentialsAddress") {
          const addr = Address.fromScAddress(credentials.address().address()).toString();
          return addr.toLowerCase() === sourceAddress.toLowerCase();
        }
        return true;
      } catch {
        return false;
      }
    });

    if (!isAuthorized) {
      throw new Error(
        `Transaction simulation requested unauthorized signers beyond the connected account (${sourceAddress}). Authorization rejected.`
      );
    }
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
 * Read a value from a Soroban contract and decode return XDR into native application data.
 */
export async function readContractValue<T = any>(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = []
): Promise<T | null> {
  validateContractId(contractId, "Treasury");
  const server = getRpcServer();
  const contract = new Contract(contractId);
  
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

  if (simulated.result?.retval) {
    return scValToNative(simulated.result.retval) as T;
  }
  return null;
}
