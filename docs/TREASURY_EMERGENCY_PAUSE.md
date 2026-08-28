# Treasury Emergency Pause

## Purpose

The treasury can pause new withdrawal activity during an incident without
giving an administrator a unilateral withdrawal or unpause capability.

## Authorization and scope

Any configured treasury signer can propose a pause or unpause request. The
proposer is recorded as the first approval. A request changes state only after
the treasury's existing signer threshold approves it and any signer executes
it. Admin, ACL, governance, and a single signer cannot bypass this threshold.

While paused, the treasury rejects before state mutation or token transfer:

- `propose_withdrawal`
- `approve`
- `execute`
- `execute_governance_withdrawal`

Deposits, transaction cancellation/revocation, read methods, and the pause
request methods remain available. This lets funds be received, operators audit
the incident, and the signer threshold recover service without an admin
backdoor.

## State and replay protection

`PauseState` stores `paused` and a monotonic `version`. Each successful
transition increments the version and emits `(treasury, pause)` with the
request ID, state, and version. Requests include the treasury policy version,
their approvals, and an executed flag.

A request is invalid once executed, once it no longer changes the current
state, or after a signer/threshold/governance policy change. This makes an
unpause approval single-use and prevents replay or threshold changes from
authorizing a stale request.

Events retained for incident evidence:

- `(treasury, pause_pr)` records request ID, proposer, desired state, and
  policy version.
- `(treasury, pause_ap)` records each signer approval.
- `(treasury, pause)` records the threshold-authorized transition and version.

## Recovery procedure

1. Confirm the incident and preserve the pause request, approval, and pause
   event records with their ledger transaction hashes.
2. Inspect `get_pause_state`, pending withdrawals, the signer set, threshold,
   and governance configuration. Reconcile actual token balance with the
   treasury's tracked balance.
3. Remediate the cause. If signer or threshold policy changes are needed, make
   them before proposing recovery; they intentionally invalidate earlier pause
   requests.
4. A signer calls `propose_pause(signer, false)`. Independent configured
   signers call `approve_pause` until the live threshold is met.
5. Any signer calls `execute_pause`. Confirm `get_pause_state().paused` is
   false and its version increased exactly once before resuming withdrawals.

The same threshold is required to pause and unpause. There is no automated
unpause path and no privileged owner withdrawal path.
