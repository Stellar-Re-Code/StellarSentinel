# SPIKE prototype — datastore seam (throwaway)

Supports [`docs/SPIKE-datastore.md`](../../../docs/SPIKE-datastore.md) (issue #63).

**This is a spike, not production code.** It lives outside `src/` on purpose so `npm run build`
(`tsc`, which only compiles `src/**`) ignores it. It exists to prove one claim from the spike:

> The existing synchronous `Db` can sit behind an **async** `DataStore` seam with no schema changes,
> making a future Postgres swap a localized change rather than a codebase-wide rewrite.

Files:

| File | What it shows |
|---|---|
| `datastore.ts` | The async `DataStore` interface — a representative subset of `Db`. |
| `sqlite-adapter.ts` | `SqliteDataStore` wraps the current `Db` and satisfies the interface. Documents the one honest wrinkle: `better-sqlite3`'s sync transaction can't span `await`. |
| `postgres-adapter.ts` | `PostgresDataStore` skeleton — the target shape + BEGIN/COMMIT/ROLLBACK pattern the async seam enables. Pulls in **no** `pg` dependency; unimplemented methods throw `SpikeNotImplemented`. |

Proven by `backend/tests/spike-datastore.test.ts`:

```bash
cd backend && npm test -- spike-datastore
```

Discard freely once the real `DataStore` interface lands in `src/` (follow-up issue #1 in the spike doc).
