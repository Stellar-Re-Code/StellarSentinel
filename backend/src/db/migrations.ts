import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS indexed_events (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id        TEXT    UNIQUE NOT NULL,
      ledger_sequence INTEGER NOT NULL,
      ledger_timestamp TEXT   NOT NULL,
      tx_hash         TEXT    NOT NULL,
      contract_id     TEXT    NOT NULL,
      contract_type   TEXT    NOT NULL,
      event_type      TEXT    NOT NULL,
      schema_version  INTEGER NOT NULL DEFAULT 1,
      actor           TEXT,
      asset           TEXT,
      amount          TEXT,
      proposal_id     TEXT,
      lifecycle_status TEXT   NOT NULL,
      policy_version  INTEGER,
      raw_value       TEXT    NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS checkpoints (
      id            INTEGER PRIMARY KEY,
      last_ledger   INTEGER NOT NULL,
      last_event_id TEXT,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quarantined_events (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id        TEXT    NOT NULL,
      ledger_sequence INTEGER NOT NULL,
      tx_hash         TEXT    NOT NULL,
      contract_id     TEXT    NOT NULL,
      raw_topic       TEXT    NOT NULL,
      raw_value       TEXT    NOT NULL,
      reason          TEXT    NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS treasury_proposals (
      proposal_id     TEXT    NOT NULL,
      contract_id     TEXT    NOT NULL,
      proposer        TEXT    NOT NULL,
      to_address      TEXT    NOT NULL,
      amount          TEXT    NOT NULL,
      policy_version  INTEGER,
      status          TEXT    NOT NULL DEFAULT 'proposed',
      ledger_proposed INTEGER NOT NULL,
      ledger_closed   INTEGER,
      created_at      TEXT    NOT NULL,
      PRIMARY KEY (proposal_id, contract_id)
    );

    CREATE TABLE IF NOT EXISTS treasury_approvals (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id     TEXT    NOT NULL,
      contract_id     TEXT    NOT NULL,
      signer          TEXT    NOT NULL,
      approval_count  INTEGER,
      ledger_sequence INTEGER NOT NULL,
      revoked         INTEGER NOT NULL DEFAULT 0,
      UNIQUE (proposal_id, contract_id, signer)
    );

    CREATE TABLE IF NOT EXISTS treasury_balance_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id     TEXT    NOT NULL,
      ledger_sequence INTEGER NOT NULL,
      event_type      TEXT    NOT NULL,
      actor           TEXT,
      amount          TEXT    NOT NULL,
      new_balance     TEXT    NOT NULL,
      proposal_id     TEXT
    );

    CREATE TABLE IF NOT EXISTS reconciliation_results (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id      TEXT    NOT NULL,
      ledger_sequence  INTEGER NOT NULL,
      indexed_balance  TEXT    NOT NULL,
      on_chain_balance TEXT    NOT NULL,
      discrepancy      TEXT    NOT NULL,
      status           TEXT    NOT NULL,
      detail           TEXT,
      checked_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_events_contract   ON indexed_events(contract_id);
    CREATE INDEX IF NOT EXISTS idx_events_ledger     ON indexed_events(ledger_sequence);
    CREATE INDEX IF NOT EXISTS idx_events_proposal   ON indexed_events(proposal_id);
    CREATE INDEX IF NOT EXISTS idx_events_actor      ON indexed_events(actor);
    CREATE INDEX IF NOT EXISTS idx_proposals_status  ON treasury_proposals(status);
    CREATE INDEX IF NOT EXISTS idx_proposals_proposer ON treasury_proposals(proposer);
    CREATE INDEX IF NOT EXISTS idx_approvals_proposal ON treasury_approvals(proposal_id, contract_id);
    CREATE INDEX IF NOT EXISTS idx_balance_contract  ON treasury_balance_history(contract_id, ledger_sequence);
  `);
}
