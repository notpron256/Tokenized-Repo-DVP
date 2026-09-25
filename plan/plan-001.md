# Plan 001: Cross-Institution Atomic DvP Settlement — Build Plan

Author: Sebastian Higgs (via Claude Code)
Status: Approved — Phase 0 in progress
Source: [intent/intent-001.md](../intent/intent-001.md), [spec/spec-001.md](../spec/spec-001.md)

## Context

intent-001.md and spec-001.md fully specify *what* to build: a POC that atomically settles both legs of a repo trade (bank cash-leg + Depository security-leg) in a single Solana transaction, models the full open/close/rehypothecation/default lifecycle, and reuses the existing `tokenized-deposit-settlement` project's bank system unmodified. Nothing has been built yet — this repo currently contains only `intent/`, `spec/`, and empty `AGENTS.md`/`CLAUDE.md`. This plan turns spec-001.md's design into an ordered sequence of small, independently buildable, independently human-verifiable phases, and states up front the one structural decision spec.md left implicit: how the two institutions' on-chain programs physically relate to each other in code.

## Structural decision (resolved up front)

**This repo gets its own, single new Anchor workspace containing exactly one new program (`depository`). The bank's existing programs are not copied, vendored, or added as a second workspace member here — they are treated as an already-deployed, arm's-length devnet dependency, referenced only by their public program IDs and instruction layouts, exactly the way `tokenized-deposit-settlement`'s own backend already treats its two on-chain programs.**

Reasoning:

1. **Fidelity to "reuse unmodified."** intent-001.md's constraint is to reuse the bank system "unmodified" — the strongest way to guarantee that is to never place its source under this repo's build at all, not even as a byte-identical copy. A second copy in a second Cargo workspace member can drift the moment anyone touches it; a live devnet program cannot.
2. **The codebase already establishes the pattern this decision extends.** The Explore survey of `tokenized-deposit-settlement` confirmed there is no Anchor TS client anywhere in that project and no shared IDL-import mechanism between its own two programs (`compliance-hook`, `redemption-gateway`) — they're tied together only by hardcoded devnet program IDs, consumed via raw `@solana/web3.js` instruction-building in `backend/src`/`backend/scripts`. This plan's cross-repo coordination is the same pattern one level up: hardcode the bank's known devnet program/mint IDs in this repo's TypeScript layer, build its instructions by hand, and compose them into one transaction alongside the new Depository program's instruction. No new coordination mechanism is being invented.
3. **Atomicity doesn't require shared tooling.** Per spec.md's Cross-system atomicity mechanism, atomicity is a property of one Solana *transaction* (two sibling instructions, native multi-signer commit/revert) — not of a shared Cargo workspace or build pipeline. Solana has no notion of which repo a deployed program's source came from; only that both programs live on the same cluster and a client can address both. A multi-repo Cargo workspace (referencing `../../tokenized-deposit-settlement/programs/...` by relative path) is also technically fragile here — it depends on absolute, machine-specific sibling-directory placement and isn't how Anchor workspaces are meant to be used.

Practical consequence: this repo's new `programs/depository` is buildable and testable **entirely on its own** against a local validator through Phase 3 below. From Phase 4 onward (anything touching the real cash leg), work necessarily moves to devnet, because that is the only place the bank's system currently exists — its own local validator was permanently retired (ledger corruption, per its README) and devnet is now its sole active environment. This is a discovered constraint, not a choice this plan is making.

## Scope boundaries (not building)

- No UI. Neither intent.md nor spec.md describes one; every flow in spec.md is verified via on-chain state (Explorer, `spl-token account-info`, custom read scripts), matching how the prior project's earliest phases worked before any UI was built. All "run" steps below are scripts.
- No liquidation execution (spec.md, Areas of concern — explicitly out of scope on both default paths).
- No durable-nonce implementation (spec.md names it as the correct future mitigation for signature-collection latency, not something this POC needs to build).
- No changes of any kind to `/Users/sh1/tokenized-deposit-settlement`.

## Ambiguities this plan had to resolve to proceed (flagged for review, not silently assumed)

1. **Security-token decimals are unspecified in spec.md's Token design.** This plan assumes 2 decimals (matching the bank's cents convention, for consistency), so $1,020,409 face value mints as the integer `102040900`. **Needs confirmation** — spec.md never states this.
2. **How the Seller's initial custodied UST position comes into existence is not described by spec.md at all.** spec.md's Open-leg flow starts from "the Seller's custodied token account `Approve`s..." as if the balance already exists. This plan adds a Phase 2 fixture-minting step (Depository mints test UST directly into a Depository-owned custodial account) to make the example trade runnable. This is new scope this plan is introducing to make Phase 4+ testable — flagged, not hidden in Token design.
3. **The "return equivalent collateral" step between rehypothecation and happy-path close has no named instruction in spec.md.** spec.md's Close-leg flow (step 3) requires collateral to already be "back at the Seller" but never specifies what moves it there. This plan resolves it as a Depository-program instruction that mirrors Phase 5's exercise instruction in reverse (Buyer's-use account → Seller's custodied account), since the Depository already controls both accounts. **Needs confirmation** — this is this plan filling a real gap, not transcribing a spec.md decision.
4. **spec.md's Buyer-default path references "the Buyer's cash/collateral posted for the rehypothecated position" — but no such posted-collateral mechanism is defined anywhere in spec.md.** There is no on-chain account, in any flow or in Token design, representing margin or collateral the Buyer has posted. Rather than invent a new margin-posting mechanism unsupported by spec.md, this plan resolves the Buyer-default claim as a **status-only transition**: the instruction flips the trade-state's status to `Buyer-defaulted` and emits an event, moving no funds — consistent with spec.md's own statement that only the on-chain *trigger* is in scope and liquidation/enforcement is not. This resolution stands as correct for this POC.

   **What this deliberately defers, named explicitly rather than left as an unnoticed gap:** in reality, a Buyer's failure to return equivalent securities at maturity does not automatically trigger a full event of default across every outstanding trade between the two counterparties. Under GMRA (and the equivalent real-world practice this POC's MRA-based design implies), the non-defaulting party (the Seller) can instead trigger a **mini close-out** scoped to just the one failed transaction: the repurchase price owed (cash principal plus accrued repo interest) is netted against the defaulted securities' current market value, producing a single net cash payment owed by one party to the other. A full event of default — closing out *all* outstanding trades between the two counterparties at once — is the more severe alternative real market practice reserves for broader cases. This POC's status-only Buyer-default flag implements neither the mini close-out nor the full close-out; it only marks that the condition triggering one of them has occurred. Implementing the netting itself would require a market-value input for the defaulted securities — a pricing/valuation input intent-001.md explicitly excludes as negotiation logic. Named here so the status-only resolution reads as a deliberate, scoped-out boundary, not an overlooked mechanism.
5. **The mechanism by which "the Buyer instructs the Depository"** (to exercise rehypothecation, or to trigger a default claim) is left unspecified in spec.md beyond "an off-chain instruction." This plan treats a human running the relevant CLI script as that instruction — the same level of simplification spec.md itself uses elsewhere (e.g., a simulated deposit event standing in for a real client action in the prior project). Not treated as blocking, just noted.

## Build phases

### Phase 0 — Devnet prerequisites: onboard trade parties on the existing bank system
**Files created (this repo):** `fixtures/devnet-accounts.md` (records the resulting devnet addresses/IDs for reuse by later phases/scripts — the only new artifact; everything else in this phase runs entirely inside `tokenized-deposit-settlement`, unmodified).
**Traces to:** intent-001.md "Affected users and systems" (Buyer and Seller are clients of the same bank) + spec-001.md Client consent / authorization model (pre-authorization lives in the bank's existing account relationship).
**Steps:** Using `tokenized-deposit-settlement`'s existing, unmodified UI/backend: onboard two clients ("Buyer Prime Broker LLC", "Seller Hedge Fund LP"), thaw both accounts, run a simulated deposit event crediting the Buyer at least $1,000,000 in tokenized deposits.
**Done-test (human-observable):** Open the sibling project's Onboarding page, confirm both clients show as active/thawed; open the Compliance or client-balance view and see the Buyer's tokenized balance reads at least $1,000,000.00. No new code to read — just two UI screens.

### Phase 1 — Depository Anchor workspace + program skeleton
**Files created:** `Anchor.toml`, `Cargo.toml` (workspace), `programs/depository/Cargo.toml`, `programs/depository/src/lib.rs` (declares the program ID, one no-op `initialize` instruction).
**Traces to:** spec-001.md Technical approach ("a new, minimal Rust/Anchor program"); mirrors `tokenized-deposit-settlement`'s own `Anchor.toml`/workspace layout (`[programs.localnet]`, `programs/*` workspace members) found by the Explore survey.
**Done-test:** Run `anchor build` (succeeds, plain terminal output) then `anchor deploy` to a local validator; run `solana program show <PROGRAM_ID> --url localhost` and read its plain-text output confirming the program is deployed and executable. No code reading required — just two commands and their printed output.

### Phase 2 — Security-leg mint + initial Seller custody funding
**Files created:** `scripts/create-security-mint.ts`, `keys/local/depository-ops.json` + `keys/devnet/depository-ops.json` (mirrors the sibling's `backend/keys/<network>/` convention).
**Traces to:** spec-001.md Token design ("Security leg standard: base SPL Token... on Solana devnet") + Example trade (the $1,020,409 face-value pledge amount). Also directly implements Ambiguity #2 above.
**Done-test:** Run the script; look up the resulting Depository-owned custodial token account on Solana Explorer (localhost or devnet, matching the run) and visually confirm its balance reads exactly 1,020,409.00 tokens of the new mint.

### Phase 3 — Trade-state account + open-leg pledge instruction (Depository-only)
**Files created:** `programs/depository/src/state.rs` (`TradeState`: security id, face value, cash amount, term, rate, day-count, status, collateral-location — per spec.md Token design), `programs/depository/src/instructions/open_pledge.rs` (creates the trade-state account, CPIs into base SPL Token's `Approve` from the Seller's custodied account to the Depository's PDA), `scripts/read-trade-state.ts` (decodes and prints a trade-state account — reused by every later phase's done-test).
**Traces to:** spec-001.md Delegate-based right-of-use mechanics (`Approve`-based design) + Open-leg flow step 3 (Depository-only portion) + Token design's trade-state account description.
**Done-test:** Run a script invoking only this instruction (no bank leg yet). Then run `spl-token account-info <SELLER_CUSTODIED_ACCOUNT>` and visually confirm `Delegate: <Depository PDA>` and `Approved Amount: 1,020,409`. Run `read-trade-state.ts` and confirm it prints status `open` with the correct face value and security id.

### Phase 4 — Cross-institution atomic open-leg transaction (the atomicity centerpiece)
**Files created:** `scripts/open-trade.ts` (builds the bank's cash-leg `TransferChecked` instruction against the sibling project's already-deployed devnet mint/compliance-hook, per its hardcoded devnet program/mint addresses, alongside this repo's `open_pledge` instruction; signs with both the bank's and Depository's operator-authority keys; submits as one transaction).
**Traces to:** spec-001.md Cross-system atomicity mechanism (single transaction, two sibling instructions, native multi-signer commit/revert) + Open-leg flow (full 6-step happy path) + Failure/unwind at open (structural elimination claim). **Runs against devnet only** (see Structural decision — no local bank deployment exists to test against).
**Done-test, two parts:**
- *Happy path:* run the script once, take the returned signature to Solana Explorer (devnet), and visually confirm one transaction containing exactly two instructions, both succeeded — Buyer's tokenized balance down $1,000,000, Seller's custodied UST account now showing the Depository PDA as delegate for 1,020,409.
- *Negative path (the actual atomicity proof):* re-run with a deliberately invalid parameter (e.g., an amount exceeding the Seller's actual UST balance) and confirm on Explorer that the transaction shows as **failed in its entirety** — Buyer's cash balance unchanged, no delegate set — directly demonstrating spec.md's "structurally eliminated, not merely detected" claim, observable without reading any code.

### Phase 5 — Rehypothecation exercise (mid-trade)
**Files created:** `programs/depository/src/instructions/exercise_rehypothecation.rs` (creates the per-trade Buyer's-use account, CPIs `invoke_signed` transfer from Seller's custodied account to it via the delegate, updates trade-state's collateral-location field), `scripts/rehypothecate.ts`.
**Traces to:** spec-001.md Rehypothecation exercise flow (mid-trade) in full, including the per-trade (not pooled) Buyer's-use account from Token design.
**Done-test:** Run the script; on Explorer confirm the Seller's custodied account balance dropped by 1,020,409 and a new Buyer's-use account now holds exactly that amount; run `read-trade-state.ts` and confirm collateral-location now reads "at Buyer's use."

### Phase 6 — Return of collateral (fills Ambiguity #3) + close-leg happy path
**Files created:** `programs/depository/src/instructions/return_rehypothecated.rs` (transfer Buyer's-use → Seller's custodied, mirrors Phase 5 in reverse), `programs/depository/src/instructions/release_pledge.rs` (`Revoke`, gated on collateral-location == at-Seller), `scripts/return-collateral.ts`, `scripts/close-trade.ts` (atomic 2-instruction close: bank credits Seller-to-Buyer $1,000,101.39, Depository releases pledge).
**Traces to:** spec-001.md Close-leg flow (happy path) in full, including the fungibility-based equivalent-securities check.
**Done-test, two runs:**
- *Without rehypothecation:* open a fresh trade (Phases 3–4 only), immediately close it; Explorer shows one atomic transaction, Seller's tokenized balance down $1,000,101.39 / Buyer's up the same, Seller's custodied UST account delegate cleared, `read-trade-state.ts` prints status `closed`.
- *With rehypothecation:* open, exercise (Phase 5), return-collateral, then close; same end state confirmed the same way, proving the fungibility claim ("any tokens of the same mint/amount" — not the original units — satisfy the return) by using the same script path without special-casing which specific tokens came back.

### Phase 7 — Seller-default claim
**Files created:** `programs/depository/src/instructions/seller_default_claim.rs` (checks `Clock::get()?.unix_timestamp` against trade-state's scheduled-close + 1 business day; if past deadline, unilaterally executes the delegate transfer to a claim account, sets status `Seller-defaulted`), `scripts/seller-default-claim.ts`.
**Traces to:** spec-001.md Failure/unwind at close → Seller default, including the concrete 1-business-day grace period and GMRA rationale.
**Done-test, two runs:** open a trade with an artificially past scheduled-close date (test fixture parameter) and (a) attempt the claim *before* the fixture's deadline — confirm the transaction fails with a distinct, readable on-chain error, no funds move; (b) attempt it *after* the deadline — confirm on Explorer the collateral moves to the claim account and `read-trade-state.ts` prints status `Seller-defaulted`.

### Phase 8 — Buyer-default claim (status-only, per Ambiguity #4)
**Files created:** `programs/depository/src/instructions/buyer_default_claim.rs` (checks collateral-location against the same grace-period deadline; if still "at Buyer's use," transitions status to `Buyer-defaulted` and emits an event — no fund movement, per Ambiguity #4), `scripts/buyer-default-claim.ts`.
**Traces to:** spec-001.md Failure/unwind at close → Buyer default (the mechanical trigger definition), constrained by Ambiguity #4's resolution.
**Done-test:** open a trade, exercise rehypothecation, do *not* return collateral, advance past the fixture deadline, run the claim script; confirm on Explorer/logs that an event was emitted and `read-trade-state.ts` now prints status `Buyer-defaulted`, while the Buyer's-use account balance is visibly unchanged (demonstrating no fund movement occurred, only the flag).

### Phase 9 — Full-lifecycle end-to-end script
**Files created:** `scripts/e2e-full-lifecycle.ts` (runs Phases 0/2–6 back to back against devnet with the exact example-trade numbers from spec.md, printing a running plain-text summary after each step).
**Traces to:** spec-001.md Example trade (grounds the POC) — this is the single script that reproduces that worked example end to end.
**Done-test:** Run the script once, unattended; read its printed step-by-step summary (dollar amounts, signatures, final balances) and independently spot-check two or three of the printed numbers against Explorer. This is the sign-off run for the whole POC.

## Sequencing / dependency notes

- Phases 0–3 are independent of each other except that Phase 3 needs Phase 2's minted collateral to `Approve` against, and Phase 1's deployed program to run against.
- Phase 4 is the hard gate: nothing past it can be tested until it works, since every later phase depends on a trade that was genuinely opened atomically.
- Phases 5–6 and 7–8 are two independent branches off Phase 4 (rehypothecate-then-close vs. default), not a strict chain — they can be built in either order once Phase 4 is done.
- Phase 9 depends on everything before it and should be built last.

## Verification summary

Every phase's done-test above is a command's plain-text output or a Solana Explorer page — nothing requires reading this project's own source to confirm correctness. Where spec.md makes a specific quantitative or structural claim (the atomicity revert in Phase 4, the fungibility-based equivalent-return in Phase 6, the mechanical default trigger in Phases 7–8), the done-test is designed to make that specific claim observable, not just "the script ran."
