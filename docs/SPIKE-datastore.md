# SPIKE: Backend datastore and scaling strategy (SQLite vs Postgres/Redis)

> Status: **Spike / decision record** — time-boxed investigation, not an implementation.
> Resolves the questions in issue #63. The full datastore migration is **explicitly out of scope**.

## 1. Context

The indexer (`backend/`) persists everything through a single concrete class,
[`Db`](../backend/src/db/client.ts), which wraps [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
over a local file (`DATABASE_PATH`, default `./data/indexer.db`; `:memory:` for tests).
Schema is created by [`runMigrations`](../backend/src/db/migrations.ts) as one idempotent
`CREATE TABLE IF NOT EXISTS` block executed in the `Db` constructor.

Meanwhile the [README architecture diagram](../README.md) and Tech Stack table advertise
**PostgreSQL + Redis**. So today there is a documented-vs-implemented gap: the code is SQLite-only,
the docs promise Postgres/Redis. This spike decides which of those two is correct going forward.

## 2. Requirements (what the data layer actually has to do)

Derived from the current implementation and the treasury/governance domain — there are no published
production traffic numbers, so these are the working assumptions the recommendation is grounded in.
They should be revisited if real numbers land.

| Dimension | Current reality | Assessment |
|---|---|---|
| **Write path** | Single indexer process; one poll every `POLL_INTERVAL_MS` (default 5s), up to `BATCH_SIZE` (default 200) events per poll, all inserted in one transaction ([`indexer.poll`](../backend/src/indexer/indexer.ts)). | **Single writer.** Peak sustained ceiling ≈ 40 events/s; real treasury/governance event volume is far lower (deposits, proposals, approvals, executes are human-paced). |
| **Event volume** | `indexed_events` grows by one row per on-chain event, append-mostly. | Low. Thousands of rows/day across many treasuries is a realistic ceiling — comfortably inside SQLite's envelope (SQLite handles multi-GB DBs and >100k writes/s in WAL mode for a single writer). |
| **Read path** | REST API ([`server.ts`](../backend/src/api/server.ts)) serving dashboard/audit queries: by-contract, by-proposal, by-actor, balance history, reconciliation status. All indexed (see `migrations.ts` indexes). | Read-mostly, low QPS, all point/range lookups on indexed columns. No analytical aggregation yet. |
| **Reconciliation** | Runs every `RECONCILE_EVERY_N_BATCHES` (12 ≈ 1 min), compares indexed balance to on-chain ([`reconciler.ts`](../backend/src/indexer/reconciler.ts)). | Periodic, low frequency, single row written. |
| **Concurrency** | API and indexer run **in the same process** (`index.ts` starts both), sharing one `Db` handle. | This is the real constraint, not row count — see §3. |
| **Availability / ops** | Local file; no managed backup, PITR, or replication. | Fine for dev/hackathon; a gap for anything with real custody stakes. |

**Conclusion:** the pressure is **not** volume — SQLite is nowhere near its throughput limits here.
The pressure is **topology**: the moment the indexer and API become separate deployable processes
(or the indexer is scaled/HA'd), a single-writer file database on local disk stops fitting.

## 3. Does the `Db` abstraction support swapping SQLite → Postgres?

Short answer: **not cleanly today.** The gaps, in order of migration cost:

### 3.1 Synchronous API is the load-bearing leak
`better-sqlite3` is synchronous. Every method on `Db` returns a value, not a Promise, and every caller
relies on that:

- [`transaction<T>(fn: () => T): T`](../backend/src/db/client.ts#L252) wraps `better-sqlite3`'s
  **synchronous** transaction. [`indexer.poll`](../backend/src/indexer/indexer.ts#L86) runs the entire
  per-batch loop — parse, insert, dispatch handlers, upsert checkpoint — inside
  `this.db.transaction(() => { ... })`.
- Handlers (`handlers/treasury.ts`, `governance.ts`, `vault.ts`, `acl.ts`) and API routes
  (`routes/treasury.ts`, `routes/history.ts`) all call `db.*` synchronously.

A `pg` (node-postgres) driver is **async**. Adopting it forces:
1. Every `Db` method → `Promise`-returning.
2. Every call site → `await` (≈10 files).
3. `transaction()` → `(fn: () => Promise<T>) => Promise<T>`, backed by a pooled client running
   `BEGIN … COMMIT/ROLLBACK`. A `better-sqlite3` synchronous transaction **cannot span an `await`**,
   so the current batch-loop shape (async RPC work already lives *outside* the sync tx — good) ports,
   but the helper's contract changes and must be re-audited for atomicity.

This is the single biggest reason the swap is not a drop-in: it is an API-color change (sync → async),
not just a SQL-string change.

### 3.2 No seam / port
Everything imports the **concrete** class: `import type { Db } from '../db/client'`. There is no
`DataStore` interface, so there is no place to swap an implementation. The prototype in
`backend/spikes/datastore/` introduces exactly this seam.

### 3.3 SQLite dialect embedded in `Db` and `migrations.ts`
Portable-with-edits, but real work:

| SQLite-ism | Location | Postgres equivalent |
|---|---|---|
| `INSERT OR IGNORE` | `insertEvent` | `INSERT … ON CONFLICT DO NOTHING` |
| `datetime('now')` | checkpoints, `created_at` defaults | `now()` / `CURRENT_TIMESTAMP` |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | most tables | `BIGSERIAL` / `GENERATED … AS IDENTITY` |
| Booleans as `INTEGER` (`revoked` 0/1) | `treasury_approvals` | `BOOLEAN` |
| `result.changes > 0` to detect insert | `insertEvent` | `RETURNING` + `rowCount` |
| `PRAGMA journal_mode=WAL`, `foreign_keys=ON` | `Db` constructor | not applicable / connection config |
| `i128` amounts as `TEXT` | balances, amounts | `NUMERIC(39,0)` (or keep `TEXT`) |
| `ON CONFLICT(cols) DO UPDATE SET … excluded.*` | upserts | Portable — Postgres supports the same syntax |

### 3.4 Migrations have no version tracking
`runMigrations` is one idempotent block run at every startup — additive columns are safe, but there is
no `schema_migrations` ledger, no ordering, and no down-path. This is the same concern raised in Q4 and
should be fixed regardless of the SQLite/Postgres decision.

**Migration cost estimate:** *medium.* ~10 call sites to async-ify, one interface to introduce, one SQL
dialect port, plus a proper migration runner. Estimate 3–5 focused days with tests, most of it the
sync→async conversion and re-verifying batch atomicity — **not** a weekend drop-in.

## 4. Is Redis needed, or aspirational?

**Aspirational today.** Nothing in the current code caches or does pub/sub, and the read QPS does not
justify a cache. Redis would earn its place only for a concrete role:

- **Live dashboard updates (pub/sub):** if the frontend needs push updates (new event / reconciliation
  mismatch) instead of polling the REST API. **But** if we move to Postgres, `LISTEN/NOTIFY` covers this
  with zero extra infrastructure. Recommendation: prefer Postgres `LISTEN/NOTIFY`; only add Redis pub/sub
  if you fan out to many API replicas.
- **Hot-read cache:** premature — every read is already an indexed point/range lookup.
- **Rate limiting / ephemeral job coordination:** not currently needed.

**Recommendation: drop Redis from the "required stack" framing in the README** and reintroduce it behind
a specific need, or update the README to reflect SQLite as the current datastore.

## 5. Schema / migration story (durable cursor, reconciliation, versioned events)

- **Durable cursor:** already solid — the `checkpoints` table (single row `id=1`, `last_ledger` +
  `last_event_id`) is a durable resume point, updated atomically inside the same batch transaction as the
  events it covers ([`indexer.poll`](../backend/src/indexer/indexer.ts#L128)). If the indexer is ever
  sharded per contract, promote this to a per-contract cursor (`checkpoints(contract_id PK, …)`).
- **Reconciliation records:** `reconciliation_results` exists and is append-only; adequate.
- **Versioned events:** `indexed_events.schema_version` already carries a per-event version, and
  malformed events are quarantined rather than dropped (`quarantined_events`) — a good base. What's
  missing is a **documented schema-version registry** and an **additive-only migration discipline** so
  old rows stay decodable.
- **Missing piece (both paths):** replace the single idempotent `runMigrations` block with a numbered
  migration runner + `schema_migrations` table. Files like
  `backend/src/db/migrations/0001_init.sql`, `0002_add_x.sql`, applied in order and recorded. This is the
  prerequisite for evolving `indexed_events` safely under either datastore.

## 6. Recommendation

**Stay on SQLite now. Introduce a `DataStore` seam so Postgres is a localized change later. Move to
Postgres when — and only when — the indexer and API become separate deployable processes or you need
concurrent writers / managed durability. Do not add Redis yet.**

Rationale: at current scale SQLite is faster and simpler (no network hop, no separate service, trivial
local dev and CI). The thing that will actually force Postgres is **deployment topology**, not data
volume. Paying the sync→async migration cost *now* buys nothing; paying for the **seam** now makes the
eventual move cheap and de-risks it.

### Phased plan
- **Phase 0 — Seam (small, do now):** extract a `DataStore` interface; make `Db` implement it; change
  call sites to depend on the interface. This is the prototype in `backend/spikes/datastore/` promoted to
  `src/`. Low risk, unblocks everything else. *(Note: the interface should be async from day one so the
  Postgres adapter drops in without a second refactor — the SQLite adapter simply wraps sync calls in
  resolved Promises.)*
- **Phase 1 — Migration runner:** add `schema_migrations` + numbered migration files (§5). Replace the
  single idempotent block. Datastore-agnostic.
- **Phase 2 — Postgres adapter (only when topology demands):** implement `PostgresDataStore` against the
  same interface (skeleton already in the spike), port the dialect (§3.3), swap via `DATASTORE=postgres`.
  Keep SQLite as the default for dev/CI.
- **Phase 3 — Live updates (only if needed):** Postgres `LISTEN/NOTIFY` (or SSE from the API) before
  reaching for Redis.

## 7. The prototype (`backend/spikes/datastore/`)

A minimal, **throwaway** proof that the recommended seam works against the existing code:

- `datastore.ts` — an **async** `DataStore` interface (a representative subset of `Db`).
- `sqlite-adapter.ts` — `SqliteDataStore`, which wraps the existing `Db` and satisfies the interface,
  proving the current implementation conforms with no schema changes. It also documents the one honest
  wrinkle: `better-sqlite3`'s synchronous transaction can't span `await`, so the async `transaction()`
  seam degrades for SQLite (called out inline).
- `postgres-adapter.ts` — a `PostgresDataStore` **skeleton** (no `pg` dependency pulled in) that shows the
  target shape and the exact BEGIN/COMMIT/ROLLBACK transaction pattern the async seam enables.
- Exercised by `backend/tests/spike-datastore.test.ts` against an in-memory `Db`.

Run it: `cd backend && npm test -- spike-datastore`.

## 8. Proposed follow-up implementation issues

Ready to file against the chosen path (documented here rather than auto-filed so the maintainers pick the
direction first):

1. **Introduce a `DataStore` interface and make `Db` implement it** (Phase 0). Depend on the interface at
   all call sites. Async signatures from day one.
2. **Add a versioned migration runner** (`schema_migrations` + numbered SQL files), replacing the single
   idempotent block (Phase 1).
3. **Document the event schema-version registry** and adopt additive-only migration discipline for
   `indexed_events`.
4. **Postgres adapter behind `DATASTORE` env switch** (Phase 2) — port the SQLite dialect per §3.3, keep
   SQLite as the dev/CI default.
5. **README correction:** either reflect SQLite as the current datastore or gate Postgres/Redis behind the
   phased plan; remove Redis from the "required" stack until a concrete role exists (§4).
6. **Live-update channel evaluation:** Postgres `LISTEN/NOTIFY` vs SSE vs Redis pub/sub — only if the
   dashboard needs push (Phase 3).

## 9. Out of scope (per issue #63)

Performing the full datastore migration. This document delivers the decision, the abstraction-gap
analysis, a discardable prototype, and the follow-up issue list — not a Postgres cutover.
