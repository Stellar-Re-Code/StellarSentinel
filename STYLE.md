# Style Guide — StellarGuard

This document defines the coding standards for all contributions to the StellarGuard project.

---

## 🦀 Rust (Soroban Smart Contracts)

### Formatting

- Use `rustfmt` for all formatting — run `cargo fmt` before every commit.
- Use `clippy` for linting — run `cargo clippy` and resolve all warnings.

### Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Functions | `snake_case` | `create_proposal` |
| Types/Structs | `PascalCase` | `TreasuryConfig` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_SIGNERS` |
| Enums | `PascalCase` variants | `ProposalStatus::Active` |
| Modules | `snake_case` | `mod treasury_logic;` |

### Contract Functions

```rust
// ✅ Good: descriptive, uses require_auth, returns Result
pub fn deposit(env: Env, from: Address, amount: i128) -> Result<(), Error> {
    from.require_auth();
    // logic...
    Ok(())
}

// ❌ Bad: no auth check, unclear naming, panics
pub fn d(env: Env, a: Address, n: i128) {
    // logic that panics on error
}
```

### Error Handling

- Define all errors in a `#[contracterror]` enum.
- Never use `.unwrap()` in contract code — always propagate errors.
- Use descriptive error variant names.

```rust
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    InsufficientFunds = 4,
    InvalidThreshold = 5,
    ProposalNotFound = 6,
    AlreadyVoted = 7,
    VotingClosed = 8,
}
```

### Storage

- Use `DataKey` enum for all storage keys.
- Prefer `Persistent` storage for user/state data.
- Use `Instance` storage for contract-wide config (admin, threshold).
- Set appropriate TTL values for persistent entries.

---

## 📘 TypeScript (Frontend)

### Formatting

- Use **Prettier** for formatting.
- Use **ESLint** with the Next.js recommended config.

### Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Components | `PascalCase` | `TreasuryCard.tsx` |
| Hooks | `camelCase` with `use` prefix | `useTreasury.ts` |
| Utilities | `camelCase` | `formatAddress.ts` |
| Constants | `SCREAMING_SNAKE_CASE` | `NETWORK_PASSPHRASE` |
| Types/Interfaces | `PascalCase` | `ProposalData` |

### Component Structure

```tsx
// ✅ Good: typed props, descriptive names
interface ProposalCardProps {
  proposal: ProposalData;
  onVote: (id: number, vote: boolean) => void;
}

export function ProposalCard({ proposal, onVote }: ProposalCardProps) {
  return (
    <div className="proposal-card">
      <h3>{proposal.title}</h3>
      <button onClick={() => onVote(proposal.id, true)}>
        Approve
      </button>
    </div>
  );
}
```

### File Organization

- One component per file.
- Co-locate styles with components when possible.
- Keep hooks in `hooks/` directory.
- Keep Soroban interaction helpers in `lib/`.

---

## 📝 General Rules

1. **No commented-out code** in commits.
2. **No `console.log`** in production code (use proper logging).
3. **Write tests** for all new functions.
4. **Document public APIs** with JSDoc (TS) or `///` doc comments (Rust).
5. **Keep functions small** — aim for single responsibility.
