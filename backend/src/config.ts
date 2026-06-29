import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export interface Config {
  sorobanRpcUrl: string;
  networkPassphrase: string;
  contracts: {
    treasury: string | null;
    governance: string | null;
    vault: string | null;
    acl: string | null;
  };
  databasePath: string;
  pollIntervalMs: number;
  batchSize: number;
  startLedger: number;
  logLevel: string;
  apiPort: number;
  corsOrigin: string;
}

export function loadConfig(): Config {
  return {
    sorobanRpcUrl: optional('SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org'),
    networkPassphrase: optional(
      'STELLAR_NETWORK_PASSPHRASE',
      'Test SDF Network ; September 2015'
    ),
    contracts: {
      treasury: process.env['TREASURY_CONTRACT_ID'] ?? null,
      governance: process.env['GOVERNANCE_CONTRACT_ID'] ?? null,
      vault: process.env['VAULT_CONTRACT_ID'] ?? null,
      acl: process.env['ACL_CONTRACT_ID'] ?? null,
    },
    databasePath: optional('DATABASE_PATH', './data/indexer.db'),
    pollIntervalMs: parseInt(optional('POLL_INTERVAL_MS', '5000'), 10),
    batchSize: parseInt(optional('BATCH_SIZE', '200'), 10),
    startLedger: parseInt(optional('START_LEDGER', '0'), 10),
    logLevel: optional('LOG_LEVEL', 'info'),
    apiPort: parseInt(optional('API_PORT', '3001'), 10),
    corsOrigin: optional('CORS_ORIGIN', 'http://localhost:3000'),
  };
}

export function contractIdMap(config: Config): Map<string, 'treasury' | 'governance' | 'vault' | 'acl'> {
  const m = new Map<string, 'treasury' | 'governance' | 'vault' | 'acl'>();
  if (config.contracts.treasury) m.set(config.contracts.treasury, 'treasury');
  if (config.contracts.governance) m.set(config.contracts.governance, 'governance');
  if (config.contracts.vault) m.set(config.contracts.vault, 'vault');
  if (config.contracts.acl) m.set(config.contracts.acl, 'acl');
  return m;
}
