import { xdr, scValToNative } from '@stellar/stellar-sdk';
import type { RawSorobanEvent, ParsedEvent, ParseResult, ContractType, AnyEventType, LifecycleStatus } from '../types/events';

// Current schema version — bump when event shapes change
const SCHEMA_VERSION = 1;

function decodeScVal(b64: string): unknown {
  return scValToNative(xdr.ScVal.fromXDR(b64, 'base64'));
}

function decodeTopic(b64: string): string {
  const native = decodeScVal(b64);
  if (typeof native !== 'string') throw new Error(`Topic is not a symbol: ${typeof native}`);
  return native;
}

// Map from (namespace, eventType) → lifecycle status
const STATUS_MAP: Record<string, Record<string, LifecycleStatus>> = {
  treasury: {
    init: 'initialized', deposit: 'deposited', propose: 'proposed',
    approve: 'approved', execute: 'executed', revoke: 'revoked',
    cancel: 'canceled', add_sig: 'signer_added', rem_sig: 'signer_removed',
    thresh: 'threshold_changed', admin: 'admin_transferred',
  },
  gov: {
    init: 'initialized', propose: 'proposed', vote: 'vote_cast',
    finalize: 'finalized', exec: 'governance_executed',
    admin: 'admin_transferred', quorum: 'quorum_updated',
  },
  vault: {
    init: 'initialized', lock: 'locked', claim: 'claimed',
    vest: 'vesting', v_claim: 'vested',
    emrg_ap: 'approved', emrg_ex: 'executed', admin: 'admin_transferred',
  },
  acl: {
    init: 'initialized', assign: 'role_assigned', revoke: 'role_revoked',
  },
};

const NAMESPACE_TO_CONTRACT: Record<string, ContractType> = {
  treasury: 'treasury',
  gov: 'governance',
  vault: 'vault',
  acl: 'acl',
};

// Extract actor, asset, amount, proposalId from decoded value + event type
function extractFields(
  namespace: string,
  eventType: string,
  value: unknown,
): { actor: string | null; asset: string | null; amount: string | null; proposalId: string | null; policyVersion: number | null } {
  const v = value as unknown[];
  const str = (x: unknown): string | null => (x != null ? String(x) : null);
  const bigstr = (x: unknown): string | null => (x != null ? String(x as bigint) : null);

  if (namespace === 'treasury') {
    switch (eventType) {
      case 'init':
        return { actor: str(v[0]), asset: str(v[1]), amount: null, proposalId: null, policyVersion: null };
      case 'deposit':
        return { actor: str(v[0]), asset: null, amount: bigstr(v[1]), proposalId: null, policyVersion: null };
      case 'propose':
        return { actor: str(v[1]), asset: null, amount: bigstr(v[3]), proposalId: str(v[0]), policyVersion: null };
      case 'approve':
        return { actor: str(v[1]), asset: null, amount: null, proposalId: str(v[0]), policyVersion: null };
      case 'execute':
        return { actor: str(v[1]), asset: null, amount: bigstr(v[2]), proposalId: str(v[0]), policyVersion: null };
      case 'revoke':
        return { actor: str(v[1]), asset: null, amount: null, proposalId: str(v[0]), policyVersion: null };
      case 'cancel':
        return { actor: str(v[1]), asset: null, amount: null, proposalId: str(v[0]), policyVersion: null };
      case 'add_sig':
      case 'rem_sig':
        return { actor: str(v[0]), asset: null, amount: null, proposalId: null, policyVersion: null };
      case 'thresh':
        return { actor: null, asset: null, amount: null, proposalId: null, policyVersion: typeof v === 'number' ? v : null };
      case 'admin':
        return { actor: str(v[1]), asset: null, amount: null, proposalId: null, policyVersion: null };
    }
  }

  if (namespace === 'gov') {
    switch (eventType) {
      case 'init':
        return { actor: str(v[0]), asset: null, amount: null, proposalId: null, policyVersion: null };
      case 'propose':
        return { actor: str(v[1]), asset: null, amount: null, proposalId: str(v[0]), policyVersion: null };
      case 'vote':
        return { actor: str(v[1]), asset: null, amount: null, proposalId: str(v[0]), policyVersion: null };
      case 'finalize':
      case 'exec':
        return { actor: null, asset: null, amount: null, proposalId: str(v[0]), policyVersion: null };
      case 'admin':
        return { actor: str(v[1]), asset: null, amount: null, proposalId: null, policyVersion: null };
    }
  }

  if (namespace === 'vault') {
    switch (eventType) {
      case 'lock':
        return { actor: str(v[1]), asset: null, amount: bigstr(v[2]), proposalId: str(v[0]), policyVersion: null };
      case 'claim':
        return { actor: str(v[1]), asset: null, amount: bigstr(v[2]), proposalId: str(v[0]), policyVersion: null };
      case 'vest':
        return { actor: str(v[1]), asset: null, amount: bigstr(v[2]), proposalId: str(v[0]), policyVersion: null };
      case 'v_claim':
        return { actor: str(v[1]), asset: null, amount: bigstr(v[2]), proposalId: str(v[0]), policyVersion: null };
      case 'emrg_ap':
        return { actor: str(v[1]), asset: null, amount: null, proposalId: str(v[0]), policyVersion: null };
      case 'emrg_ex':
        return { actor: str(v[1]), asset: null, amount: bigstr(v[2]), proposalId: str(v[0]), policyVersion: null };
    }
  }

  if (namespace === 'acl') {
    switch (eventType) {
      case 'assign':
        return { actor: str((v as unknown[])[2]), asset: null, amount: null, proposalId: null, policyVersion: null };
      case 'revoke':
        return { actor: str((v as unknown[])[1]), asset: null, amount: null, proposalId: null, policyVersion: null };
    }
  }

  return { actor: null, asset: null, amount: null, proposalId: null, policyVersion: null };
}

export function parseEvent(
  raw: RawSorobanEvent,
  contractType: ContractType,
): ParseResult {
  try {
    if (raw.topic.length < 2) {
      return { ok: false, reason: 'insufficient topics', rawTopics: raw.topic, rawValue: raw.value };
    }

    const namespace = decodeTopic(raw.topic[0]);
    const eventType = decodeTopic(raw.topic[1]);

    const knownNamespace = STATUS_MAP[namespace];
    if (!knownNamespace) {
      return { ok: false, reason: `unknown namespace: ${namespace}`, rawTopics: raw.topic, rawValue: raw.value };
    }

    const lifecycleStatus = knownNamespace[eventType];
    if (!lifecycleStatus) {
      return { ok: false, reason: `unknown event type: ${namespace}/${eventType}`, rawTopics: raw.topic, rawValue: raw.value };
    }

    const rawValue = decodeScVal(raw.value);

    // thresh emits a bare ScU32, not a tuple — handle that gracefully
    const valueAsArray = Array.isArray(rawValue) ? rawValue : [rawValue];

    const fields = extractFields(namespace, eventType, valueAsArray);

    const parsed: ParsedEvent = {
      rawId: raw.id,
      ledger: parseInt(raw.ledger, 10),
      ledgerTimestamp: raw.ledgerClosedAt,
      txHash: raw.txHash ?? raw.id,
      contractId: raw.contractId,
      contractType,
      eventType: eventType as AnyEventType,
      schemaVersion: SCHEMA_VERSION,
      actor: fields.actor,
      asset: fields.asset,
      amount: fields.amount,
      proposalId: fields.proposalId,
      lifecycleStatus,
      policyVersion: fields.policyVersion,
      rawValue,
    };

    return { ok: true, event: parsed };
  } catch (err) {
    return {
      ok: false,
      reason: `parse error: ${(err as Error).message}`,
      rawTopics: raw.topic,
      rawValue: raw.value,
    };
  }
}
