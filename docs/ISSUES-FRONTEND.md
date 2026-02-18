# Frontend Issues — StellarGuard 🎨

This document tracks all frontend development tasks for the StellarGuard dashboard.

### 🛑 STRICT RULE FOR CONTRIBUTORS
**When you complete an issue:**
1. Mark the checkbox `[x]`
2. Append your GitHub username and the Date/Time.
3. **Example:** `- [x] Create FreighterContext (@yourname - 2026-02-20 15:00 UTC)`

---

## 🚀 Module 6: Foundation & Config (FE-1 to FE-5)

### Issue #FE-1: Project Scaffold & Theme
**Priority:** Critical
**Labels:** `frontend`, `config`, `good-first-issue`
**Description:** Initialize Next.js app with correct styling and brand theme.
- **Tasks:**
  - [ ] Configure `tailwind.config.ts` with StellarGuard brand colors (primary blue, stellar purple, dark theme).
  - [ ] Setup `globals.css` with CSS variables and custom utility classes (`.btn-primary`, `.btn-secondary`, `.card`, `.gradient-text`).
  - [ ] Create root `Layout` with glassmorphism navbar, navigation links (Dashboard, Treasury, Governance).
  - [ ] Add Inter and JetBrains Mono fonts.
  - [ ] Add proper `<meta>` tags for SEO.

### Issue #FE-2: Freighter Context Provider
**Priority:** Critical
**Labels:** `frontend`, `wallet`, `integration`
**Description:** Manage wallet state globally using React Context.
- **Tasks:**
  - [ ] Create `FreighterProvider` in `src/context/FreighterProvider.tsx`.
  - [ ] Define `FreighterContextType` interface: `address`, `network`, `isConnecting`, `isConnected`, `isFreighterInstalled`, `connect`, `disconnect`, `error`.
  - [ ] Implement `checkConnection` on component mount using `@stellar/freighter-api`.
  - [ ] Implement `connectWallet` function with `requestAccess()`.
  - [ ] Export `useFreighter` hook.
  - [ ] Wrap root layout with `FreighterProvider`.

### Issue #FE-3: Wallet Connect Button Component
**Priority:** High
**Labels:** `frontend`, `ui`, `good-first-issue`
**Description:** A smart button that handles different wallet authentication states.
- **Tasks:**
  - [ ] Create `WalletConnect.tsx` component.
  - [ ] State: Not Installed → Show "Install Freighter" with link to extension.
  - [ ] State: Disconnected → Show "Connect Wallet" button.
  - [ ] State: Connecting → Show loading spinner.
  - [ ] State: Connected → Show truncated address (`G1AB...XY9Z`).
  - [ ] Add dropdown with disconnect option when connected.
  - [ ] Wire up to `useFreighter` hook.

### Issue #FE-4: Network Configuration
**Priority:** High
**Labels:** `frontend`, `config`
**Description:** Setup network constants for Soroban RPC connection.
- **Tasks:**
  - [ ] Define `NETWORKS` object in `src/lib/network.ts` with Testnet, Futurenet, Mainnet configs.
  - [ ] Each config contains: `name`, `networkPassphrase`, `sorobanRpcUrl`, `horizonUrl`, `friendbotUrl`.
  - [ ] Create `getServer()` helper returning `SorobanRpc.Server` instance.
  - [ ] Create `fundAccount(address)` helper for testnet friendbot funding.
  - [ ] Export `ACTIVE_NETWORK`, `SOROBAN_RPC_URL`, `NETWORK_PASSPHRASE`.

### Issue #FE-5: UI Component Library Setup
**Priority:** Medium
**Labels:** `frontend`, `ui`
**Description:** Install and configure foundational UI blocks.
- **Tasks:**
  - [ ] Install and configure ShadcnUI (Button, Card, Dialog, Input, Badge, Skeleton).
  - [ ] Configure `components.json` for ShadcnUI.
  - [ ] Create reusable `Skeleton` loading component.
  - [ ] Create reusable `Badge` component for status display.

---

## 💰 Module 7: Treasury Features (FE-6 to FE-12)

### Issue #FE-6: Treasury Dashboard Layout
**Priority:** High
**Labels:** `frontend`, `ui`
**Description:** Build the main treasury dashboard page.
- **Tasks:**
  - [ ] Create `/treasury` page in Next.js App Router.
  - [ ] Add header with "Treasury" title and "+ Deposit" button.
  - [ ] Add balance overview card showing total XLM and approval threshold.
  - [ ] Add "Pending Transactions" section.
  - [ ] Add "History" section with transaction table.

### Issue #FE-7: Deposit Modal UI
**Priority:** High
**Labels:** `frontend`, `ui`
**Description:** Create a modal form for depositing funds into the treasury.
- **Tasks:**
  - [ ] Create Modal/Dialog component with form.
  - [ ] Add amount input (XLM) with validation.
  - [ ] Show gas fee estimate.
  - [ ] Add confirm/cancel buttons.
  - [ ] Show loading state during transaction.
  - [ ] Show success/error feedback with toast.

### Issue #FE-8: Withdrawal Proposal Form
**Priority:** High
**Labels:** `frontend`, `ui`
**Description:** Form for creating new withdrawal proposals.
- **Tasks:**
  - [ ] Create proposal form with fields: To (Stellar address), Amount (XLM), Memo (description).
  - [ ] Validate Stellar address format (G... or C... prefix, 56 chars).
  - [ ] Validate amount against treasury balance.
  - [ ] Submit via `useTreasury().proposeWithdrawal()`.

### Issue #FE-9: Approval Button Component
**Priority:** High
**Labels:** `frontend`, `ui`, `interaction`
**Description:** Interactive button for approving pending treasury transactions.
- **Tasks:**
  - [ ] Create `ApproveButton` component in `TreasuryCard`.
  - [ ] Show current approval count vs threshold.
  - [ ] Handle click → sign approval transaction.
  - [ ] Disable if already approved by current user.
  - [ ] Show "Execute" button when threshold is met.

### Issue #FE-10: Transaction History Table
**Priority:** Medium
**Labels:** `frontend`, `ui`, `data`
**Description:** Table displaying past treasury transactions.
- **Tasks:**
  - [ ] Create sortable table with columns: ID, To, Amount, Status, Approvals.
  - [ ] Color-code status (Pending = yellow, Executed = green).
  - [ ] Add pagination or infinite scroll.
  - [ ] Link transaction IDs to detail views.
  - [ ] Add search/filter by status.

### Issue #FE-11: Balance Display Card
**Priority:** Medium
**Labels:** `frontend`, `ui`, `data`
**Description:** Real-time treasury balance display component.
- **Tasks:**
  - [ ] Create `BalanceCard` component.
  - [ ] Fetch balance from Soroban contract using `readContractValue`.
  - [ ] Format stroops to XLM (divide by 10^7).
  - [ ] Show threshold as "X of Y signers".
  - [ ] Add auto-refresh on interval or after transactions.

### Issue #FE-12: XDR Building (Treasury Calls)
**Priority:** Critical
**Labels:** `frontend`, `soroban`, `integration`
**Description:** Construct Soroban transaction XDRs for all treasury contract interactions.
- **Tasks:**
  - [ ] Implement `buildContractCall()` in `src/lib/soroban.ts`.
  - [ ] Create transaction builder for `deposit(from, amount)`.
  - [ ] Create transaction builder for `propose_withdrawal(proposer, to, amount, memo)`.
  - [ ] Create transaction builder for `approve(signer, tx_id)`.
  - [ ] Create transaction builder for `execute(executor, tx_id)`.
  - [ ] Handle argument encoding (Address → `nativeToScVal`, i128 → `nativeToScVal`).
  - [ ] Implement `signAndSubmit()` flow with Freighter.

---

## 🗳️ Module 8: Governance Features (FE-13 to FE-19)

### Issue #FE-13: Proposal List Page
**Priority:** High
**Labels:** `frontend`, `ui`, `routing`
**Description:** Page listing all governance proposals.
- **Tasks:**
  - [ ] Create `/governance` page with proposal cards.
  - [ ] Fetch proposals from Soroban contract.
  - [ ] Separate "Active" and "Past" proposal sections.
  - [ ] Show governance stats (total proposals, active, quorum %, members).
  - [ ] Add "+ New Proposal" button.

### Issue #FE-14: Create Proposal Modal
**Priority:** High
**Labels:** `frontend`, `ui`
**Description:** Modal form for creating new governance proposals.
- **Tasks:**
  - [ ] Create Modal with fields: Title, Description, Action Type (dropdown), Amount (for Funding), Target Address (for AddMember/RemoveMember).
  - [ ] Conditionally show fields based on action type.
  - [ ] Validate form with Zod schema.
  - [ ] Submit via `useGovernance().createProposal()`.

### Issue #FE-15: Proposal Detail Page
**Priority:** Medium
**Labels:** `frontend`, `routing`, `data`
**Description:** Detailed view for a single proposal.
- **Tasks:**
  - [ ] Create `/proposals/[id]` dynamic route.
  - [ ] Fetch proposal data from contract.
  - [ ] Show title, description, proposer, status, dates.
  - [ ] Show voting progress (for/against bars).
  - [ ] Show vote action buttons.
  - [ ] Show live vote count updates.

### Issue #FE-16: Vote Casting UI
**Priority:** High
**Labels:** `frontend`, `ui`, `interaction`
**Description:** Interface for casting votes on proposals.
- **Tasks:**
  - [ ] Create `VoteButton` component with For/Against variants.
  - [ ] Check if user has already voted using `hasVoted()`.
  - [ ] Disable buttons if voting is closed or already voted.
  - [ ] Handle vote transaction signing and submission.
  - [ ] Show success toast after voting.

### Issue #FE-17: Proposal Status Badge
**Priority:** Low
**Labels:** `frontend`, `ui`
**Description:** Color-coded badge component for proposal status.
- **Tasks:**
  - [ ] Create `StatusBadge` component.
  - [ ] Active → green, Passed → blue, Rejected → red, Executed → purple, Expired → gray.
  - [ ] Add subtle glow effect for active proposals.
  - [ ] Support small and large sizes.

### Issue #FE-18: Voting Progress Bar
**Priority:** Medium
**Labels:** `frontend`, `ui`
**Description:** Visual bar showing vote distribution.
- **Tasks:**
  - [ ] Create dual progress bar (green for For, red for Against).
  - [ ] Show vote counts on each end.
  - [ ] Show quorum threshold line.
  - [ ] Animate bar fill on load.

### Issue #FE-19: XDR Building (Governance Calls)
**Priority:** Critical
**Labels:** `frontend`, `soroban`, `integration`
**Description:** Construct Soroban transaction XDRs for governance contract interactions.
- **Tasks:**
  - [ ] Create transaction builder for `create_proposal(proposer, title, description, action, amount, target)`.
  - [ ] Create transaction builder for `vote(voter, proposal_id, vote_for)`.
  - [ ] Create transaction builder for `finalize(caller, proposal_id)`.
  - [ ] Create transaction builder for `execute_proposal(executor, proposal_id)`.
  - [ ] Handle `Symbol` encoding for title and description.
  - [ ] Handle `ProposalAction` enum encoding.

---

## ✨ Module 9: Polish & UX (FE-20 to FE-25)

### Issue #FE-20: Data Fetching Hooks
**Priority:** Critical
**Labels:** `frontend`, `data`, `integration`
**Description:** Create custom React hooks for contract data.
- **Tasks:**
  - [ ] Implement `useTreasury()` hook: `getBalance`, `getConfig`, `deposit`, `proposeWithdrawal`, `approve`, `execute`.
  - [ ] Implement `useGovernance()` hook: `getConfig`, `getProposal`, `createProposal`, `vote`, `finalize`, `hasVoted`.
  - [ ] Add loading and error states to each hook.
  - [ ] Implement auto-refresh on relevant data.

### Issue #FE-21: Toast Notification System
**Priority:** Medium
**Labels:** `frontend`, `ui`, `ux`
**Description:** Global notification system for transaction feedback.
- **Tasks:**
  - [ ] Install and configure `react-hot-toast`.
  - [ ] Create transaction flow toasts: "Signing...", "Submitting...", "Confirmed!", "Failed".
  - [ ] Style toasts to match dark theme.
  - [ ] Add dismiss functionality.
  - [ ] Show transaction links in success toasts (link to Stellar Expert).

### Issue #FE-22: Loading Skeleton Components
**Priority:** Low
**Labels:** `frontend`, `ui`
**Description:** Skeleton loading states for all data-dependent components.
- **Tasks:**
  - [ ] Create `SkeletonCard` component.
  - [ ] Create `SkeletonTable` component.
  - [ ] Create `SkeletonStats` component.
  - [ ] Apply skeletons to Treasury and Governance pages while data loads.
  - [ ] Add subtle shimmer animation.

### Issue #FE-23: Mobile Responsiveness
**Priority:** Medium
**Labels:** `frontend`, `ui`
**Description:** Ensure full mobile compatibility of all pages.
- **Tasks:**
  - [ ] Stack columns on screens < 768px.
  - [ ] Fix modal width on mobile (full-width with padding).
  - [ ] Add hamburger menu for mobile navigation.
  - [ ] Ensure table scrolls horizontally on small screens.
  - [ ] Test touch interactions for vote and approve buttons.

### Issue #FE-24: Dark Mode Toggle
**Priority:** Low
**Labels:** `frontend`, `ui`, `ux`
**Description:** Allow users to switch between dark and light themes.
- **Tasks:**
  - [ ] Create `ThemeToggle` component in navbar.
  - [ ] Use `next-themes` or custom CSS class toggle.
  - [ ] Define light mode color palette in `tailwind.config.ts`.
  - [ ] Persist preference in localStorage.
  - [ ] Default to dark mode.

### Issue #FE-25: Error Boundary & Fallback UI
**Priority:** Medium
**Labels:** `frontend`, `error-handling`
**Description:** Graceful error handling for component failures.
- **Tasks:**
  - [ ] Create `ErrorBoundary` wrapper component.
  - [ ] Create `ErrorFallback` component with retry button.
  - [ ] Add `error.tsx` files for Next.js route error handling.
  - [ ] Handle wallet disconnection errors gracefully.
  - [ ] Show user-friendly messages for contract errors.

---

## ✅ Completed Issues
*(Move completed items here)*
