const assert = require("node:assert/strict");
const { test } = require("node:test");

// Re-implementation of the multi-sig state transitions for invariant verification
interface TreasuryConfig {
  admin: string;
  threshold: number;
  signerCount: number;
  balance: number;
  txCount: number;
  policyVersion: number;
}

interface TreasuryTransaction {
  id: number;
  to: string;
  amount: number;
  memo: string;
  approvals: string[];
  executed: boolean;
  canceled: boolean;
  created_at: number;
  expires_at: number;
  proposer: string;
  policy_version: number;
}

function proposeWithdrawal(
  config: TreasuryConfig,
  txs: TreasuryTransaction[],
  address: string,
  to: string,
  amount: number,
  memo: string,
  expiryHours: number,
  now: number,
  isSigner: (addr: string) => boolean
) {
  if (!isSigner(address)) throw new Error("Only authorized signers can propose withdrawals");
  if (amount <= 0) throw new Error("Withdrawal amount must be greater than zero");
  if (config.balance < amount) throw new Error("Treasury does not have enough funds to process withdrawal");

  const nextId = config.txCount + 1;
  const newTx: TreasuryTransaction = {
    id: nextId,
    to,
    amount,
    memo: memo || "Withdrawal Proposal",
    approvals: [address], // proposer automatically approves
    executed: false,
    canceled: false,
    created_at: now,
    expires_at: now + 3600 * expiryHours,
    proposer: address,
    policy_version: config.policyVersion,
  };

  return {
    nextConfig: { ...config, txCount: nextId },
    nextTxs: [newTx, ...txs],
  };
}

function approve(
  config: TreasuryConfig,
  tx: TreasuryTransaction,
  address: string,
  now: number,
  isSigner: (addr: string) => boolean
) {
  if (!isSigner(address)) throw new Error("Only authorized signers can approve transactions");
  if (tx.executed) throw new Error("Transaction has already been executed");
  if (tx.canceled) throw new Error("Transaction has been canceled");
  if (now > tx.expires_at) throw new Error("Transaction has expired");
  if (tx.policy_version !== config.policyVersion) throw new Error("Transaction policy has been invalidated");
  if (tx.approvals.includes(address)) throw new Error("Signer has already approved this transaction");

  return {
    ...tx,
    approvals: [...tx.approvals, address],
  };
}

function revokeApproval(
  config: TreasuryConfig,
  tx: TreasuryTransaction,
  address: string,
  now: number,
  isSigner: (addr: string) => boolean
) {
  if (!isSigner(address)) throw new Error("Only authorized signers can revoke approvals");
  if (tx.executed) throw new Error("Transaction has already been executed");
  if (tx.canceled) throw new Error("Transaction has been canceled");
  if (now > tx.expires_at) throw new Error("Transaction has expired");
  if (tx.policy_version !== config.policyVersion) throw new Error("Transaction policy has been invalidated");
  if (!tx.approvals.includes(address)) throw new Error("Signer has not approved this transaction");

  return {
    ...tx,
    approvals: tx.approvals.filter((a) => a !== address),
  };
}

function execute(
  config: TreasuryConfig,
  tx: TreasuryTransaction,
  address: string,
  now: number
) {
  if (tx.executed) throw new Error("Transaction has already been executed");
  if (tx.canceled) throw new Error("Transaction has been canceled");
  if (now > tx.expires_at) throw new Error("Transaction has expired");
  if (tx.policy_version !== config.policyVersion) throw new Error("Transaction policy has been invalidated");
  if (tx.approvals.length < config.threshold) {
    throw new Error("Caller is not authorized: approval threshold not met");
  }
  if (config.balance < tx.amount) {
    throw new Error("Treasury does not have enough funds to process withdrawal");
  }

  const updatedTx = { ...tx, executed: true };
  const updatedConfig = { ...config, balance: config.balance - tx.amount };
  return { updatedTx, updatedConfig };
}

// ── Invariant Tests ──────────────────────────────────────────────────────────

const SIGNERS = ["GA_A", "GA_B", "GA_C"];
const isSigner = (addr: string) => SIGNERS.includes(addr);

test("proposal creation counts proposer approval automatically", () => {
  const initialConfig: TreasuryConfig = {
    admin: "GA_A",
    threshold: 2,
    signerCount: 3,
    balance: 5000,
    txCount: 0,
    policyVersion: 1,
  };

  const { nextConfig, nextTxs } = proposeWithdrawal(
    initialConfig,
    [],
    "GA_A", // proposer
    "GA_DEST",
    1000,
    "Test Proposal",
    24,
    100000,
    isSigner
  );

  assert.equal(nextConfig.txCount, 1);
  assert.equal(nextTxs.length, 1);
  assert.deepEqual(nextTxs[0].approvals, ["GA_A"]);
  assert.equal(nextTxs[0].policy_version, 1);
});

test("proposing withdrawal checks signer role and balance", () => {
  const initialConfig: TreasuryConfig = {
    admin: "GA_A",
    threshold: 2,
    signerCount: 3,
    balance: 5000,
    txCount: 0,
    policyVersion: 1,
  };

  // Non-signer should fail
  assert.throws(() => {
    proposeWithdrawal(initialConfig, [], "GA_NON_SIGNER", "GA_DEST", 1000, "Test", 24, 100000, isSigner);
  }, /Only authorized signers/);

  // Insufficient funds should fail
  assert.throws(() => {
    proposeWithdrawal(initialConfig, [], "GA_A", "GA_DEST", 6000, "Test", 24, 100000, isSigner);
  }, /enough funds/);
});

test("signers can approve and double-approvals are blocked", () => {
  const config: TreasuryConfig = {
    admin: "GA_A",
    threshold: 2,
    signerCount: 3,
    balance: 5000,
    txCount: 1,
    policyVersion: 1,
  };

  const tx: TreasuryTransaction = {
    id: 1,
    to: "GA_DEST",
    amount: 1000,
    memo: "Test",
    approvals: ["GA_A"],
    executed: false,
    canceled: false,
    created_at: 100000,
    expires_at: 200000,
    proposer: "GA_A",
    policy_version: 1,
  };

  // Another signer approves
  const approvedTx = approve(config, tx, "GA_B", 150000, isSigner);
  assert.deepEqual(approvedTx.approvals, ["GA_A", "GA_B"]);

  // Proposer trying to approve again should fail
  assert.throws(() => {
    approve(config, tx, "GA_A", 150000, isSigner);
  }, /already approved/);
});

test("signers can revoke approvals and only if they previously approved", () => {
  const config: TreasuryConfig = {
    admin: "GA_A",
    threshold: 2,
    signerCount: 3,
    balance: 5000,
    txCount: 1,
    policyVersion: 1,
  };

  const tx: TreasuryTransaction = {
    id: 1,
    to: "GA_DEST",
    amount: 1000,
    memo: "Test",
    approvals: ["GA_A", "GA_B"],
    executed: false,
    canceled: false,
    created_at: 100000,
    expires_at: 200000,
    proposer: "GA_A",
    policy_version: 1,
  };

  // Revoke B's approval
  const revokedTx = revokeApproval(config, tx, "GA_B", 150000, isSigner);
  assert.deepEqual(revokedTx.approvals, ["GA_A"]);

  // C trying to revoke should fail since they never approved
  assert.throws(() => {
    revokeApproval(config, tx, "GA_C", 150000, isSigner);
  }, /has not approved/);
});

test("execution is blocked until threshold is met", () => {
  const config: TreasuryConfig = {
    admin: "GA_A",
    threshold: 2,
    signerCount: 3,
    balance: 5000,
    txCount: 1,
    policyVersion: 1,
  };

  const tx: TreasuryTransaction = {
    id: 1,
    to: "GA_DEST",
    amount: 1000,
    memo: "Test",
    approvals: ["GA_A"], // only 1 approval, threshold is 2
    executed: false,
    canceled: false,
    created_at: 100000,
    expires_at: 200000,
    proposer: "GA_A",
    policy_version: 1,
  };

  assert.throws(() => {
    execute(config, tx, "GA_A", 150000);
  }, /threshold not met/);
});

test("execution succeeds once threshold is met, deducting balance", () => {
  const config: TreasuryConfig = {
    admin: "GA_A",
    threshold: 2,
    signerCount: 3,
    balance: 5000,
    txCount: 1,
    policyVersion: 1,
  };

  const tx: TreasuryTransaction = {
    id: 1,
    to: "GA_DEST",
    amount: 1000,
    memo: "Test",
    approvals: ["GA_A", "GA_B"], // 2 approvals, meets threshold
    executed: false,
    canceled: false,
    created_at: 100000,
    expires_at: 200000,
    proposer: "GA_A",
    policy_version: 1,
  };

  const { updatedTx, updatedConfig } = execute(config, tx, "GA_C", 150000);
  assert.equal(updatedTx.executed, true);
  assert.equal(updatedConfig.balance, 4000);
});

test("expiry invalidates approval and execution", () => {
  const config: TreasuryConfig = {
    admin: "GA_A",
    threshold: 2,
    signerCount: 3,
    balance: 5000,
    txCount: 1,
    policyVersion: 1,
  };

  const tx: TreasuryTransaction = {
    id: 1,
    to: "GA_DEST",
    amount: 1000,
    memo: "Test",
    approvals: ["GA_A"],
    executed: false,
    canceled: false,
    created_at: 100000,
    expires_at: 200000,
    proposer: "GA_A",
    policy_version: 1,
  };

  // Attempting approval after expiry (at t = 250000) should fail
  assert.throws(() => {
    approve(config, tx, "GA_B", 250000, isSigner);
  }, /expired/);

  // Attempting execution after expiry should fail
  const multiSignedTx = { ...tx, approvals: ["GA_A", "GA_B"] };
  assert.throws(() => {
    execute(config, multiSignedTx, "GA_C", 250000);
  }, /expired/);
});

test("policy change invalidates pending proposals", () => {
  const configWithStalePolicy: TreasuryConfig = {
    admin: "GA_A",
    threshold: 2,
    signerCount: 3,
    balance: 5000,
    txCount: 1,
    policyVersion: 2, // policy version incremented to 2
  };

  const tx: TreasuryTransaction = {
    id: 1,
    to: "GA_DEST",
    amount: 1000,
    memo: "Test",
    approvals: ["GA_A"],
    executed: false,
    canceled: false,
    created_at: 100000,
    expires_at: 200000,
    proposer: "GA_A",
    policy_version: 1, // proposal is policy version 1
  };

  // Approving should fail because of stale policy version
  assert.throws(() => {
    approve(configWithStalePolicy, tx, "GA_B", 150000, isSigner);
  }, /invalidated/);
});
