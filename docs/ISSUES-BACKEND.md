# Backend Issues — StellarGuard ⚙️

This document tracks all backend API and infrastructure tasks for the StellarGuard platform.

### 🛑 STRICT RULE FOR CONTRIBUTORS
**When you complete an issue:**
1. Mark the checkbox `[x]`
2. Append your GitHub username and the Date/Time.
3. **Example:** `- [x] Set up FastAPI project (@yourname - 2026-02-20 15:00 UTC)`

---

## 🔌 Module 10: API Server (BE-1 to BE-5)

### Issue #BE-1: API Server Scaffold
**Priority:** High
**Labels:** `backend`, `config`, `good-first-issue`
**Description:** Initialize the backend API server project.
- **Tasks:**
  - [ ] Initialize project structure: `backend/src/`, `backend/tests/`, config files.
  - [ ] Choose framework: NestJS (TypeScript) or FastAPI (Python).
  - [ ] Setup environment configuration (`.env`, `.env.example`).
  - [ ] Configure CORS for frontend origin.
  - [ ] Create health check endpoint (`GET /api/health`).
  - [ ] Setup linting and formatting rules.

### Issue #BE-2: Treasury API Endpoints
**Priority:** High
**Labels:** `backend`, `api`
**Description:** REST endpoints for treasury data.
- **Tasks:**
  - [ ] `GET /api/treasury/balance` — Fetch treasury balance from Soroban.
  - [ ] `GET /api/treasury/config` — Fetch treasury configuration (threshold, signers).
  - [ ] `GET /api/treasury/transactions` — List all transactions with pagination.
  - [ ] `GET /api/treasury/transactions/:id` — Get single transaction by ID.
  - [ ] `GET /api/treasury/signers` — List all signers.
  - [ ] Add response schemas with Zod/Pydantic validation.

### Issue #BE-3: Governance API Endpoints
**Priority:** High
**Labels:** `backend`, `api`
**Description:** REST endpoints for governance data.
- **Tasks:**
  - [ ] `GET /api/governance/proposals` — List all proposals with filtering (status, action type).
  - [ ] `GET /api/governance/proposals/:id` — Single proposal detail with vote counts.
  - [ ] `GET /api/governance/members` — List DAO members.
  - [ ] `GET /api/governance/config` — Governance configuration.
  - [ ] `GET /api/governance/proposals/:id/votes` — Vote breakdown.

### Issue #BE-4: Token Vault API Endpoints
**Priority:** Medium
**Labels:** `backend`, `api`
**Description:** REST endpoints for token vault data.
- **Tasks:**
  - [ ] `GET /api/vault/locks` — List all token locks.
  - [ ] `GET /api/vault/locks/:id` — Single lock detail.
  - [ ] `GET /api/vault/vestings` — List vesting schedules.
  - [ ] `GET /api/vault/vestings/:id` — Single vesting detail with claimable amount.
  - [ ] `GET /api/vault/stats` — Overall vault statistics.

### Issue #BE-5: API Authentication & Rate Limiting
**Priority:** Medium
**Labels:** `backend`, `security`
**Description:** Secure the API with proper authentication and rate limiting.
- **Tasks:**
  - [ ] Add API key authentication for write endpoints.
  - [ ] Implement rate limiting (100 req/min per IP).
  - [ ] Add CORS whitelist configuration.
  - [ ] Add request logging middleware.
  - [ ] Setup Swagger/OpenAPI documentation endpoint.

---

## 🗄️ Module 11: Database & Caching (BE-6 to BE-8)

### Issue #BE-6: Database Schema Design
**Priority:** High
**Labels:** `backend`, `database`
**Description:** Design PostgreSQL schema for caching on-chain data.
- **Tasks:**
  - [ ] Create `treasuries` table: id, admin, threshold, balance, created_at.
  - [ ] Create `transactions` table: id, treasury_id, to_address, amount, memo, status, approvals_json, created_at.
  - [ ] Create `proposals` table: id, title, description, action, status, proposer, votes_for, votes_against, created_at, ends_at.
  - [ ] Create `token_locks` table: id, owner, amount, locked_at, unlock_at, claimed.
  - [ ] Create `vesting_schedules` table: id, beneficiary, total_amount, claimed_amount, start_time, duration, cliff.
  - [ ] Create migration scripts.

### Issue #BE-7: Redis Cache Layer
**Priority:** Medium
**Labels:** `backend`, `caching`
**Description:** Add Redis caching for frequently queried data.
- **Tasks:**
  - [ ] Setup Redis client connection.
  - [ ] Cache treasury balance (TTL: 30s).
  - [ ] Cache proposal list (TTL: 60s).
  - [ ] Cache member list (TTL: 300s).
  - [ ] Invalidate cache on relevant contract events.

### Issue #BE-8: Database Seed & Fixtures
**Priority:** Low
**Labels:** `backend`, `testing`
**Description:** Create test fixtures and seed data for development.
- **Tasks:**
  - [ ] Create seed script with sample treasury data.
  - [ ] Create seed script with sample proposals (various statuses).
  - [ ] Create seed script with sample token locks and vestings.
  - [ ] Document how to reset and re-seed the database.

---

## 🔍 Module 12: Event Indexer (BE-9 to BE-10)

### Issue #BE-9: Soroban Event Listener
**Priority:** High
**Labels:** `backend`, `indexer`, `integration`
**Description:** Listen for Soroban contract events and index them.
- **Tasks:**
  - [ ] Connect to Soroban RPC using `getEvents` API.
  - [ ] Filter events by contract IDs (treasury, governance, vault, access-control).
  - [ ] Parse event data (topic, value decoding).
  - [ ] Store indexed events in PostgreSQL.
  - [ ] Handle reconnection and missed events (cursor management).
  - [ ] Process events: `(treasury, deposit)`, `(treasury, propose)`, `(treasury, approve)`, `(treasury, execute)`.
  - [ ] Process events: `(gov, propose)`, `(gov, vote)`, `(gov, finalize)`, `(gov, exec)`.
  - [ ] Process events: `(vault, lock)`, `(vault, claim)`, `(vault, vest)`, `(vault, v_claim)`.

### Issue #BE-10: Event-Driven Cache Invalidation
**Priority:** Medium
**Labels:** `backend`, `indexer`, `caching`
**Description:** Invalidate Redis cache when on-chain events are detected.
- **Tasks:**
  - [ ] On treasury events → invalidate balance cache.
  - [ ] On governance events → invalidate proposal and member caches.
  - [ ] On vault events → invalidate vault stats cache.
  - [ ] Implement WebSocket notifications to frontend on new events.

---

## ✅ Completed Issues
*(Move completed items here)*
