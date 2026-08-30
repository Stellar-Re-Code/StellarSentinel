import type { Db } from '../../db/client';
import type { ParsedEvent } from '../../types/events';

/**
 * Maintains the derived `vault_schedules` table (issue #79).
 *
 * Writes are idempotent (primary key on vault_id+contract_id) and
 * order-aware: an event at a ledger older than the stored one cannot roll
 * state backwards, so duplicate or out-of-order delivery leaves correct
 * derived state untouched.
 *
 * Payload shapes (see parser.ts):
 *  - lock:  v = [lockId, owner, amount, duration]
 *  - vest:  v = [vestingId, beneficiary, amount, duration]
 *  - claim: v = [lockId, owner, amount]
 *  - v_claim: v = [vestingId, beneficiary, amount]
 */
export function handleVaultEvent(db: Db, event: ParsedEvent): void {
	const { eventType, contractId, ledger } = event;
	const v = event.rawValue as unknown[];
	if (!Array.isArray(v) || v.length === 0) return;

	const id = String(v[0]);
	const beneficiary = event.actor ?? String(v[1] ?? '');
	const amount = event.amount ?? '0';

	switch (eventType) {
		case 'lock':
		case 'vest': {
			db.upsertVaultSchedule({
				vault_id: id,
				contract_id: contractId,
				beneficiary,
				total_amount: BigInt(amount).toString(),
				ledger,
			});
			break;
		}
		case 'claim':
		case 'v_claim': {
			db.applyVaultClaim({
				vault_id: id,
				contract_id: contractId,
				beneficiary,
				amount: BigInt(amount).toString(),
				ledger,
			});
			break;
		}
		default:
			// Emergency-approval events don't affect schedules.
			break;
	}
}
