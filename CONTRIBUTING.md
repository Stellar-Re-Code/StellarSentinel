# Contributing to StellarGuard

Thank you for your interest in building trustless treasury management on Stellar! This guide will help you contribute effectively.

## 🛠 Tech Stack

- **Smart Contracts:** Soroban (Rust, `soroban-sdk`)
- **Frontend:** Next.js, TypeScript, Tailwind CSS, Freighter Wallet
- **Backend:** FastAPI or NestJS
- **Indexing:** Custom Soroban-RPC event listener

## 📝 Commit Guidelines (Strict)

We follow a strict **Modular Commit** philosophy to ensure history is readable and revertible.

**The Golden Rule:**
> "Commit after every meaningful change, not every line."

- **Meaningful Change:** Completing a function, finishing a fix, adding a feature block, creating a file, or making a significant modification.
- **Avoid:** Micro-commits for single-line edits unless they are standalone fixes.
- **Frequency:** Commit often, but only when you finish a logical piece of work.

### Commit Message Format

```
<type>(<scope>): <description>
```

### Example Commit Messages

- `feat(treasury): implement multi-sig deposit logic`
- `feat(governance): add proposal voting function`
- `fix(ui): resolve wallet connect state bug`
- `test(treasury): add withdrawal approval tests`
- `docs: update testnet deployment guide`

### Allowed Types

| Type | Description |
|------|-------------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `test` | Adding or updating tests |
| `docs` | Documentation changes |
| `refactor` | Code refactoring (no feature/fix) |
| `style` | Formatting, semicolons, etc. |
| `chore` | Build process, dependencies |

## 📋 Issue Tracking

1. Pick an issue from the relevant `docs/ISSUES-*.md` file.
2. When you start, comment on the GitHub issue or mark it as "In Progress".
3. **When Completed:** You MUST update the corresponding `ISSUES-*.md` with:
   - Check the box `[x]`
   - Append your GitHub username and Date/Time.
   - *Example:* `- [x] Implement deposit function (@yourname - 2026-02-20 14:00 UTC)`

## 🧪 Development Workflow

1. **Fork & Clone**: Fork this repo and clone it locally.
2. **Branch**: Create a feature branch from `main`.
   ```bash
   git checkout -b feat/treasury-deposit
   ```
3. **Develop**: Write code following the [Style Guide](STYLE.md).
4. **Test**:
   - Contracts: `cd smartcontract && cargo test`
   - Frontend: `cd frontend && npm run test`
5. **Build Check**:
   - Contracts: `cargo build --all`
   - Frontend: `npm run build`
6. **Commit**: Follow the commit guidelines above.
7. **Pull Request**: Submit a PR with a clear description of your changes.

## 🏷️ Labels

| Label | Meaning |
|-------|---------|
| `critical` | Must be done first, blocks other work |
| `high` | Important, should be prioritized |
| `medium` | Standard priority |
| `low` | Nice to have, can wait |
| `good first issue` | Great for newcomers |
| `smart-contract` | Soroban/Rust work |
| `frontend` | Next.js/UI work |
| `backend` | API/indexer work |
| `devops` | CI/CD and infrastructure |

## Getting Help

- Read the **Integration Guides** in `docs/`
- Open a Discussion for questions
- Tag maintainers for urgent issues
