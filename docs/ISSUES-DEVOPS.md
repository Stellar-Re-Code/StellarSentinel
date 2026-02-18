# DevOps & Infrastructure Issues — StellarGuard 🚀

This document tracks all CI/CD, deployment, and infrastructure tasks for the StellarGuard platform.

### 🛑 STRICT RULE FOR CONTRIBUTORS
**When you complete an issue:**
1. Mark the checkbox `[x]`
2. Append your GitHub username and the Date/Time.
3. **Example:** `- [x] Create Dockerfile (@yourname - 2026-02-20 15:00 UTC)`

---

## 🏗️ Module 13: CI/CD Pipelines (DO-1 to DO-5)

### Issue #DO-1: GitHub Actions — Smart Contract CI
**Priority:** Critical
**Labels:** `devops`, `ci`, `smart-contract`
**Description:** Automated build and test pipeline for Soroban contracts.
- **Tasks:**
  - [ ] Create `.github/workflows/contracts.yml`.
  - [ ] Trigger on push/PR to `main` and `develop` branches, paths `smartcontract/**`.
  - [ ] Install Rust toolchain (stable + `wasm32-unknown-unknown` target).
  - [ ] Run `cargo build --all` — verify compilation.
  - [ ] Run `cargo test --all` — execute all unit tests.
  - [ ] Run `cargo clippy --all` — lint checks.
  - [ ] Cache Cargo dependencies for faster builds.
  - [ ] Report test results as PR check.

### Issue #DO-2: GitHub Actions — Frontend CI
**Priority:** High
**Labels:** `devops`, `ci`, `frontend`
**Description:** Automated build and lint pipeline for the Next.js frontend.
- **Tasks:**
  - [ ] Create `.github/workflows/frontend.yml`.
  - [ ] Trigger on push/PR to `main` and `develop`, paths `frontend/**`.
  - [ ] Install Node.js 20.x.
  - [ ] Run `npm ci` — install dependencies.
  - [ ] Run `npm run lint` — ESLint checks.
  - [ ] Run `npm run build` — verify build.
  - [ ] Cache `node_modules` for faster builds.

### Issue #DO-3: GitHub Actions — Backend CI
**Priority:** Medium
**Labels:** `devops`, `ci`, `backend`
**Description:** Automated test pipeline for the backend API.
- **Tasks:**
  - [ ] Create `.github/workflows/backend.yml`.
  - [ ] Setup database service container (PostgreSQL).
  - [ ] Setup Redis service container.
  - [ ] Install dependencies.
  - [ ] Run unit tests.
  - [ ] Run integration tests.
  - [ ] Generate code coverage report.

### Issue #DO-4: Contract Deployment Workflow
**Priority:** High
**Labels:** `devops`, `deployment`, `smart-contract`
**Description:** Automated deployment of Soroban contracts to testnet.
- **Tasks:**
  - [ ] Create deployment script `scripts/deploy.sh`.
  - [ ] Build optimized WASM: `soroban contract build --release`.
  - [ ] Deploy each contract: `soroban contract deploy --wasm <wasm_path> --source <deployer>`.
  - [ ] Store contract IDs in `deployed-contracts.json`.
  - [ ] Print deployed contract addresses on completion.
  - [ ] Create GitHub Actions workflow for testnet deployment on tag push.

### Issue #DO-5: PR Template & Issue Templates
**Priority:** Low
**Labels:** `devops`, `repo`
**Description:** Create GitHub templates for consistent contributions.
- **Tasks:**
  - [ ] Create `.github/PULL_REQUEST_TEMPLATE.md` with checklist.
  - [ ] Create `.github/ISSUE_TEMPLATE/bug_report.md`.
  - [ ] Create `.github/ISSUE_TEMPLATE/feature_request.md`.
  - [ ] Create `.github/ISSUE_TEMPLATE/smart_contract_task.md`.
  - [ ] Create `.github/ISSUE_TEMPLATE/frontend_task.md`.

---

## 🐳 Module 14: Docker & Local Dev (DO-6 to DO-8)

### Issue #DO-6: Docker Compose Stack
**Priority:** High
**Labels:** `devops`, `docker`
**Description:** Full local development environment with Docker Compose.
- **Tasks:**
  - [ ] Create `docker-compose.yml` at project root.
  - [ ] Define `frontend` service: build from `frontend/Dockerfile`, port 3000.
  - [ ] Define `backend` service: build from `backend/Dockerfile`, port 8000.
  - [ ] Define `postgres` service: PostgreSQL 16, port 5432.
  - [ ] Define `redis` service: Redis 7, port 6379.
  - [ ] Define `indexer` service: event listener process.
  - [ ] Add volumes for data persistence.
  - [ ] Create `.env.docker` with default configuration.

### Issue #DO-7: Frontend Dockerfile
**Priority:** Medium
**Labels:** `devops`, `docker`
**Description:** Multi-stage Dockerfile for the Next.js frontend.
- **Tasks:**
  - [ ] Create `frontend/Dockerfile` with multi-stage build.
  - [ ] Stage 1 (deps): Install `node_modules`.
  - [ ] Stage 2 (builder): Build Next.js production bundle.
  - [ ] Stage 3 (runner): Minimal image with only production files.
  - [ ] Use `node:20-alpine` as base image.
  - [ ] Set proper `NEXT_PUBLIC_*` environment variables.

### Issue #DO-8: Backend Dockerfile
**Priority:** Medium
**Labels:** `devops`, `docker`
**Description:** Dockerfile for the backend API server.
- **Tasks:**
  - [ ] Create `backend/Dockerfile`.
  - [ ] Install dependencies.
  - [ ] Copy application code.
  - [ ] Run database migrations on startup.
  - [ ] Expose API port.
  - [ ] Add health check.

---

## 📖 Module 15: Documentation (DO-9 to DO-10)

### Issue #DO-9: Smart Contract Guide
**Priority:** High
**Labels:** `documentation`
**Description:** Developer guide for the Soroban smart contracts.
- **Tasks:**
  - [ ] Write `docs/SMARTCONTRACT_GUIDE.md`.
  - [ ] Explain each contract's purpose, state schema, and public API.
  - [ ] Document all events with example payloads.
  - [ ] Provide deployment instructions.
  - [ ] Include testing guide (`cargo test`).
  - [ ] Add architecture diagram (contract interaction flow).

### Issue #DO-10: Frontend Development Guide
**Priority:** High
**Labels:** `documentation`, `frontend`
**Description:** Developer guide for the Next.js frontend.
- **Tasks:**
  - [ ] Write `docs/FRONTEND_GUIDE.md`.
  - [ ] Explain project structure (App Router, components, hooks, lib).
  - [ ] Document Freighter wallet integration.
  - [ ] Document Soroban contract interaction pattern (build → sign → submit).
  - [ ] Explain environment setup and configuration.
  - [ ] Add component screenshots (from design).

---

## ✅ Completed Issues
*(Move completed items here)*
