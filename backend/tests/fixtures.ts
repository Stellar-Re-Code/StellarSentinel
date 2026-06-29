import { xdr, Address } from '@stellar/stellar-sdk';
import type { RawSorobanEvent } from '../src/types/events';

function sym(s: string): string {
  return xdr.ScVal.scvSymbol(Buffer.from(s)).toXDR('base64');
}

function addr(a: string): string {
  try {
    return new Address(a).toScVal().toXDR('base64');
  } catch {
    // For tests use a dummy strkey
    return xdr.ScVal.scvString(Buffer.from(a)).toXDR('base64');
  }
}

function u32(n: number): xdr.ScVal {
  return xdr.ScVal.scvU32(n);
}

function u64(n: bigint): xdr.ScVal {
  return xdr.ScVal.scvU64(new xdr.Uint64(n));
}

function i128(n: bigint): xdr.ScVal {
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const lo = abs & 0xFFFFFFFFFFFFFFFFn;
  const hi = (abs >> 64n) & 0xFFFFFFFFFFFFFFFFn;
  return xdr.ScVal.scvI128(new xdr.Int128Parts({
    lo: xdr.Uint64.fromString(lo.toString()),
    hi: xdr.Int64.fromString((negative ? -1n * hi : hi).toString()),
  }));
}

function vec(...vals: xdr.ScVal[]): string {
  return xdr.ScVal.scvVec(vals).toXDR('base64');
}

// Stellar testnet addresses (G... format)
export const ADMIN = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
export const SIGNER1 = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGM6GEF6YJBJS2E42DQUHS';
export const SIGNER2 = 'GBSC7D3TVYAOBABQM7J4MWQD4AWLQSWATQCZLP5POEAZS6GHIMOZSOL';
export const ASSET = 'GDQOE23CFSUMSVQK4Y5JHPPYK73VYCNHZHA7ENKCV37P6SUEO6XQBKPP';
export const CONTRACT_ID = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
export const GOV_CONTRACT_ID = 'CBZFGGBHZKOOLPE52MBJHKTGG7BKPYB26TGSA3CRQZGQP3XHXJQDAMP';

let eventCounter = 0;
function nextId(): string {
  return `000000${++eventCounter}`;
}

function baseEvent(contractId: string, topics: string[], value: string): RawSorobanEvent {
  return {
    type: 'contract',
    ledger: '1000',
    ledgerClosedAt: '2026-01-01T00:00:00Z',
    contractId,
    id: nextId(),
    pagingToken: nextId(),
    topic: topics,
    value,
    inSuccessfulContractCall: true,
    txHash: `txhash_${eventCounter}`,
  };
}

export function makeTreasuryInitEvent(ledger = '1000'): RawSorobanEvent {
  const ev = baseEvent(
    CONTRACT_ID,
    [sym('treasury'), sym('init')],
    vec(
      xdr.ScVal.scvString(Buffer.from(ADMIN)),
      xdr.ScVal.scvString(Buffer.from(ASSET)),
      u32(2),
      u32(3),
    ),
  );
  ev.ledger = ledger;
  return ev;
}

export function makeTreasuryDepositEvent(from: string, amount: bigint, newBalance: bigint, ledger = '1001'): RawSorobanEvent {
  const ev = baseEvent(
    CONTRACT_ID,
    [sym('treasury'), sym('deposit')],
    vec(
      xdr.ScVal.scvString(Buffer.from(from)),
      i128(amount),
      i128(newBalance),
    ),
  );
  ev.ledger = ledger;
  return ev;
}

export function makeTreasuryProposeEvent(txId: bigint, proposer: string, to: string, amount: bigint, ledger = '1002'): RawSorobanEvent {
  const ev = baseEvent(
    CONTRACT_ID,
    [sym('treasury'), sym('propose')],
    vec(
      u64(txId),
      xdr.ScVal.scvString(Buffer.from(proposer)),
      xdr.ScVal.scvString(Buffer.from(to)),
      i128(amount),
    ),
  );
  ev.ledger = ledger;
  return ev;
}

export function makeTreasuryApproveEvent(txId: bigint, signer: string, approvalCount: number, ledger = '1003'): RawSorobanEvent {
  const ev = baseEvent(
    CONTRACT_ID,
    [sym('treasury'), sym('approve')],
    vec(
      u64(txId),
      xdr.ScVal.scvString(Buffer.from(signer)),
      u32(approvalCount),
    ),
  );
  ev.ledger = ledger;
  return ev;
}

export function makeTreasuryExecuteEvent(txId: bigint, to: string, amount: bigint, newBalance: bigint, ledger = '1004'): RawSorobanEvent {
  const ev = baseEvent(
    CONTRACT_ID,
    [sym('treasury'), sym('execute')],
    vec(
      u64(txId),
      xdr.ScVal.scvString(Buffer.from(to)),
      i128(amount),
      i128(newBalance),
    ),
  );
  ev.ledger = ledger;
  return ev;
}

export function makeTreasuryCancelEvent(txId: bigint, caller: string, ledger = '1003'): RawSorobanEvent {
  const ev = baseEvent(
    CONTRACT_ID,
    [sym('treasury'), sym('cancel')],
    vec(u64(txId), xdr.ScVal.scvString(Buffer.from(caller))),
  );
  ev.ledger = ledger;
  return ev;
}

export function makeTreasuryRevokeEvent(txId: bigint, signer: string, approvalCount: number, ledger = '1003'): RawSorobanEvent {
  const ev = baseEvent(
    CONTRACT_ID,
    [sym('treasury'), sym('revoke')],
    vec(u64(txId), xdr.ScVal.scvString(Buffer.from(signer)), u32(approvalCount)),
  );
  ev.ledger = ledger;
  return ev;
}

export function makeTreasuryAddSignerEvent(signer: string, count: number, ledger = '1010'): RawSorobanEvent {
  const ev = baseEvent(
    CONTRACT_ID,
    [sym('treasury'), sym('add_sig')],
    vec(xdr.ScVal.scvString(Buffer.from(signer)), u32(count)),
  );
  ev.ledger = ledger;
  return ev;
}

export function makeTreasuryThresholdEvent(threshold: number, ledger = '1010'): RawSorobanEvent {
  const ev = baseEvent(
    CONTRACT_ID,
    [sym('treasury'), sym('thresh')],
    u32(threshold).toXDR('base64'),
  );
  ev.ledger = ledger;
  return ev;
}

export function makeMalformedEvent(ledger = '1000'): RawSorobanEvent {
  return baseEvent(
    CONTRACT_ID,
    [sym('treasury'), sym('UNKNOWN_EVT_TYPE')],
    vec(xdr.ScVal.scvBool(true)),
  );
}

export function makeUnknownNamespaceEvent(ledger = '1000'): RawSorobanEvent {
  return baseEvent(
    CONTRACT_ID,
    [sym('MYSTERY'), sym('event')],
    vec(xdr.ScVal.scvBool(true)),
  );
}

export function makeGovProposeEvent(proposalId: bigint, proposer: string, ledger = '2000'): RawSorobanEvent {
  const ev = baseEvent(
    GOV_CONTRACT_ID,
    [sym('gov'), sym('propose')],
    vec(
      u64(proposalId),
      xdr.ScVal.scvString(Buffer.from(proposer)),
      xdr.ScVal.scvSymbol(Buffer.from('title')),
      xdr.ScVal.scvSymbol(Buffer.from('Funding')),
    ),
  );
  ev.ledger = ledger;
  return ev;
}
