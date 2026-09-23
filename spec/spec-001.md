# Spec 001: Cross-Institution Atomic DvP Settlement — Requirements and Design

Author: Sebastian Higgs
Status: Draft
Source: [intent/intent-001.md](../intent/intent-001.md)

## Summary

This spec resolves the five open questions from intent-001.md and specifies the open-leg, close-leg, and both default flows for a proof-of-concept cross-institution atomic DvP repo settlement system on Solana devnet. Atomicity across the bank (cash) and the Depository (securities) is achieved not through a coordinating third program or a cross-chain bridge, but through Solana's native multi-signer transaction model: one transaction, two sibling instructions, each institution's program touching only its own state, committing or reverting together. The security-leg "right of use" is modeled with base SPL Token `Approve`/`Revoke` — not the Token-2022 Permanent Delegate mechanism the prior tokenized-deposit-settlement project used for compliance clawback, which is structurally the wrong shape for a scoped, per-trade, custodian-exercised grant. Client (Buyer/Seller) consent is resolved as happening upstream, at the legal/trade-agreement layer, never as an on-chain signature inside the settlement transaction itself. Failure at open is shown to be structurally eliminated, not merely handled, by the single-transaction design. Failure at close is split into two distinct, independently-modeled default paths — Seller default (unilateral collateral claim) and Buyer default (failure to return equivalent securities after exercising rehypothecation) — both in scope, with actual liquidation execution out of scope. A follow-up design pass resolved the remaining loose ends this raised: rehypothecation is now modeled as a genuine on-chain transfer (the Buyer actually exercises the delegate allowance mid-trade, moving pledged tokens into a per-trade Depository-controlled "Buyer's use" account), SPL token fungibility is shown to resolve MRA's "equivalent, not identical" securities concept for free, the Buyer-default trigger is a mechanical on-chain check (has the collateral been moved back by the deadline) rather than an abstract condition, the grace period for both default paths is fixed at 1 business day past scheduled close (mirroring real GMRA fails-are-a-market-feature practice), and the Depository program authority is scoped to a single key, out of scope for custody/governance, matching the bank side. A concrete overnight UST repo trade grounds the whole design. The required MRA-vs-GMRA comparison matrix from intent-001.md's design principles is included below, not dropped.

## MRA vs. GMRA comparison matrix (required)

Per intent-001.md's design principles, this comparison is a required deliverable, not incidental background. It explains why MRA/NY law was deliberately chosen as the harder path, and what would change structurally if GMRA/English law were chosen instead.

| Dimension | MRA (US / NY law) — chosen | GMRA (English law) — alternative |
|---|---|---|
| **Legal structure** | Security interest / pledge. Legal title to the security stays with the Seller throughout the trade. | Full title transfer (outright sale and repurchase). Title genuinely passes to the Buyer at open and back to the Seller at close. |
| **Buyer's interest in collateral** | A perfected security interest plus a separately granted general right of use (including rehypothecation) over the pledged security — the right of use is an added grant, not automatic. | Ownership. Because title has already transferred, the Buyer's ability to use/re-transfer the security is an ordinary incident of ownership, not a separately granted right. |
| **Perfection mechanics** | Requires UCC Article 8/9 "control" mechanics to perfect the security interest against third parties. Treated as an assumed real-world fact, not re-implemented (per intent-001.md constraints). | Not applicable — there is no security interest to perfect. The Buyer already holds title outright, so "control" in the UCC sense is moot. |
| **Bankruptcy safe harbor** | 11 U.S.C. §101(47)'s definition of a qualifying "repurchase agreement"; §559 and §362(b)(7) exempt it from the automatic stay in US bankruptcy. Assumed/relied upon, not verified in code. | Relies instead on UK insolvency law and EU-derived close-out netting protection (the Financial Collateral Arrangements framework as transposed into UK law) — a different statutory basis, not the US Bankruptcy Code. |
| **Return obligation at close** | Seller repurchases *equivalent* (same issue and amount), not necessarily *identical*, securities — this is what legally permits rehypothecation in the first place. | Also equivalent, not identical, securities — GMRA uses the same "equivalent securities" concept. Not a distinguishing dimension; noted here so it isn't mistaken for one. |
| **On-chain representation implication** | Title not moving means the pledge cannot be modeled as an ownership transfer. Requires a delegate-style grant of rights over the Seller-owned token account (this spec's `Approve`-based design, see below) — a genuinely harder on-chain shape to reason about. | Since title actually transfers, the natural on-chain model is a straightforward mint/transfer/burn (or plain token transfer) ownership swap at open, reversed at close — no delegate mechanics needed. This is the "simpler alternative" intent-001.md refers to. |
| **Close-out netting** | Available on default, derived from the Bankruptcy Code safe harbors above. | Available on default, derived from UK/EU close-out netting protections above. Same practical effect, different legal derivation. |
| **Governing law / forum** | New York law. | English law. |

The net effect for this POC: MRA's title-stays-with-Seller structure is precisely what forces the harder design problem this spec solves — a delegate-style right-of-use grant rather than a transfer — and is why MRA was chosen over GMRA's simpler title-transfer model (intent-001.md, Design principles).

## Example trade (grounds the POC)

Per intent-001.md's constraint that trade agreement/pricing/negotiation is out of scope, the POC begins from this already-agreed trade rather than deriving it:

- **Security:** US Treasury Note (specific CUSIP treated as a placeholder parameter, not a real, currently-issued security)
- **Term:** Overnight repo — 1 business day, open → close
- **Cash leg:** Buyer lends $10,000,000
- **Collateral leg:** Seller pledges $10,204,082 face value of the UST (~2% haircut)
- **Repo rate:** 3.65% flat (current SOFR as of Sept 2026; spread-setting is out of scope per intent-001.md)
- **Day-count convention:** Actual/360 (standard repo market convention)
- **1-day interest:** $10,000,000 × 3.65% × 1/360 ≈ $1,013.89
- **Close-leg cash return:** $10,001,013.89 ($10,000,000 principal + $1,013.89 interest)

These numbers are used throughout the flows below rather than abstract placeholders, so each instruction's amounts are concrete.

## Cross-system atomicity mechanism

**Resolves intent-001.md's open question:** "What definitively and atomically ties the cash-leg lock/settlement to the security-leg pledge grant across two genuinely separate systems with no shared database?"

Both institutions — the bank and the Depository — run their programs on the **same Solana devnet cluster**. This is a deliberate scoping decision: real-world cross-institution settlement can and does span genuinely separate ledgers (Canton, other chains), and cross-chain/cross-ledger interop was considered and explicitly deferred as out of scope for this POC — noted here only as a real-world observation, not something this design attempts to solve. Sharing a cluster is what makes single-transaction atomicity available at all; it is the thing that makes this POC's version of the problem tractable while still being genuinely cross-*institution* (two independently operated programs, two independently controlled sets of authorities, no shared database) rather than cross-*ledger*.

The mechanism itself is a single Solana transaction containing two sibling instructions:

1. The bank's cash-leg instruction (operates on its own tokenized-deposit program/state, reused unmodified from the prior project per intent-001.md's constraints).
2. The Depository's pledge-leg instruction (operates on its own program/state, defined below).

Neither instruction invokes the other via CPI, and no third coordinating program sits between them. Atomicity comes entirely from Solana's native multi-signer transaction execution model: one transaction message can require signatures from multiple independent authorities across different programs, and the runtime commits every instruction in the message or reverts all of them together on any single instruction's failure — there is no partially-applied intermediate state at the transaction level. This is a general Solana primitive (atomic, multi-signer transactions), not bespoke infrastructure built for this project.

**Signers on the open-leg transaction:**
- The bank's operator authority (authorizing the cash-leg instruction, on pre-authorization from the Buyer's account relationship)
- The Depository's operator authority (authorizing the pledge-leg instruction, on pre-authorization from the Seller's account relationship)

**Latency consideration (named, not built for):** Solana transactions expire against a recent blockhash after roughly 90 seconds. If collecting both institutions' signatures introduces real latency beyond that window, durable nonces are the correct tool (they replace the recent-blockhash requirement with a nonce account that doesn't expire on a fixed clock). This is documented as the right mechanism if the problem materializes; the POC does not need to build nonce handling to demonstrate the atomicity model.

## Delegate-based right-of-use mechanics

**Resolves intent-001.md's open question:** "Exact on-chain mechanics for granting the cash lender/Buyer a delegate-style 'right of use' over the pledged security — how should this differ structurally from how Permanent Delegate worked in the prior project?"

**Resolved: base SPL Token `Approve`/`Revoke`, not Token-2022 Permanent Delegate.** Permanent Delegate (as used in the prior tokenized-deposit-settlement project, for compliance clawback) is structurally wrong for this use case on three separate dimensions, not just one:

- **Scope:** Permanent Delegate is mint-wide — it grants standing authority over *every* account holding that mint, not one specific pledge.
- **Permanence:** it is a fixed extension configured once on the mint and not meant to be granted/revoked per transaction.
- **Ownership:** it names one fixed authority (the bank, for clawback) baked into the mint itself, not a per-trade, per-counterparty grant.

A repo pledge needs the opposite of all three: scoped to the exact pledged amount, scoped to this specific trade, and revocable/exercisable per trade rather than fixed at mint configuration time.

**Design:** at the open leg, the Seller's Depository-custodied token account `Approve`s a delegate allowance for exactly the pledged face value ($10,204,082 in the example trade) to the Depository's own program-controlled authority (a PDA, mirroring the redemption-gateway pattern's use of a program-derived delegate in the prior project) — not directly to the Buyer. The Depository, as custodian of the Seller's position, exercises this delegate authority on the Buyer's behalf when the Buyer needs to act on the right of use (e.g., at Seller default, or when the Buyer rehypothecates — see below). This mirrors exactly how the bank exercises delegated authority over the cash leg on the Buyer's and Seller's behalf, rather than either client signing directly — consistent with how real custody models work (a custodian acts on pre-authorized instructions, not on a fresh signature from the underlying client for every action).

No ongoing Seller co-signature is required to *exercise* this delegate allowance once granted. This is a deliberate design choice, not an oversight, and it is the opposite of the redemption-gateway's co-sign pattern in the prior project (which requires a *fresh* two-party signature at the moment of exercise). MRA's "right of use" specifically and legally means the Buyer can act on the pledged collateral without the Seller's continued cooperation — requiring a live Seller co-signature to exercise it would mismodel the legal right entirely.

**Named gap, resolved by custody structure, not by the token mechanism:** a plain SPL Token `Approve` does not, by itself, grant *exclusivity* — the token account's owner can still move the underlying tokens even after approving a delegate. This is resolved here not by the token mechanism (there is no on-chain construct that revokes owner authority in a full sense the way Permanent Delegate mint-wide clawback does) but by the custody structure itself: the Seller does not directly control the custodial account holding the pledged position — the Depository does, as custodian, standing in for the real-world book-entry custody structure (a customer's securities position sits at a DTC participant's books, not literally under the customer's own signing key). The Seller cannot move tokens out from under an active pledge because the Seller was never the signing owner of that account to begin with.

**Resolved: rehypothecation is exercised on-chain for real, not merely asserted.** The delegate allowance granted at open is a genuinely exercisable authority, and this POC exercises it mid-trade rather than leaving the Buyer's right of use as a dormant, unused grant — see Rehypothecation exercise flow (mid-trade), below, for the concrete transfer instruction this produces.

## Client consent / authorization model

**Resolves intent-001.md's open question, implicitly folded into the delegate-mechanics and atomicity questions above:** where does Buyer/Seller consent to the trade actually live?

**Resolved: consent lives upstream, at the legal/trade-agreement layer — not as an on-chain signature inside the settlement transaction.** The Buyer and Seller consent to this specific trade (and to the standing account/custody relationship that lets their institution act on their behalf) through the MRA itself plus their account and custody agreements with their respective institution — modeled on real-world Standing Settlement Instructions, where a client authorizes their institution in advance to execute settlement instructions matching pre-agreed parameters, rather than co-signing every individual settlement transaction themselves.

The settlement transaction itself (both open and close) therefore carries only two signatures: the bank's operator authority and the Depository's operator authority — each institution executing on pre-authorization from its own client relationship, not on a fresh per-transaction client signature. This is consistent with how the redemption-gateway's compliance signer in the prior project acts on the bank's own authority rather than requiring the underlying client to sign a raw Solana instruction directly.

**Named, out-of-scope consideration:** transaction-payload integrity — verifying that the actual assembled set of instructions in a transaction matches what a client or institution actually agreed to (via simulation before signing, IDL-decoding the instructions to human-readable form, hardware-wallet-style "what you see is what you sign" verification) — is a real concern in any system where an institution signs on a client's behalf, but is out of scope for this POC's tooling. Noted here so it isn't mistaken for an oversight.

## Open-leg flow

1. The bank and the Depository, having each received pre-authorization from their respective client (Buyer, Seller) per the consent model above, assemble a single Solana transaction with two sibling instructions.
2. **Cash-leg instruction** (bank program, reused unmodified): locks/transfers $10,000,000 from the Buyer's tokenized deposit balance, per the existing bank-side mechanics from the tokenized-deposit-settlement project.
3. **Pledge-leg instruction** (Depository program): the Seller's custodied token account `Approve`s the Depository's PDA authority for $10,204,082 face value of the pledged UST position, recording the trade's terms (amount, security identifier, term, rate) in an on-chain trade-state account.
4. Both instructions are signed by their respective institution's operator authority and submitted as one transaction.
5. Solana's native multi-signer commit/revert semantics apply: both instructions land together, or — on any single instruction's failure — neither does. There is no intermediate state where cash has moved but the pledge hasn't, or vice versa.
6. On successful commit, the trade-state account is marked open; the Buyer now holds an exercisable, Depository-custodied delegate allowance over the pledged collateral, and the Seller now shows an increased tokenized cash balance at the bank.

## Rehypothecation exercise flow (mid-trade)

**Resolves the follow-on question of whether the Buyer's exercise of the right of use is modeled on-chain or only asserted:** it is modeled on-chain, as a real transfer. Mid-trade, the Buyer exercises the delegate allowance granted at open for real, rather than holding it dormant:

1. The Buyer instructs the Depository (an off-chain instruction to the custodian, mirroring how the Buyer's original trade consent flows to their institution — see Client consent / authorization model, above) to exercise its existing `Approve` allowance over the Seller's custodied position.
2. The Depository's PDA, authorized via that delegate allowance (`invoke_signed`), executes a real SPL Token transfer instruction moving the pledged tokens ($10,204,082 face value, in the example trade) out of the Seller's custodied account into a separate, Depository-controlled "Buyer's use" account scoped to this one trade (see Token design, below, for why this account is per-trade rather than pooled).
3. This is a real, spending transfer, not a log entry or event asserting that rehypothecation happened — the tokens genuinely leave the Seller's custodied account. The trade-state account's collateral-location field is updated to reflect that this trade's collateral now sits in the Buyer's use account rather than at the Seller.
4. This represents the Buyer's own use of the position (e.g., conceptually re-pledging or re-lending it elsewhere) — it is not modeled as a second counterparty or a second full trade; the Buyer's use account is simply where this POC represents tokens the Buyer has exercised its right of use over, standing in for whatever the Buyer actually does with them off-chain.

**Fungibility resolves "equivalent, not identical" for free.** Because SPL tokens of the same mint and amount are fungible by definition, there is no lot-level or serial identity to track for the pledged position — any tokens of the same mint and amount returned to the Seller's custodied account later satisfy the equivalent-securities return obligation (see Close-leg flow and Failure/unwind at close, below), regardless of whether they are the literal token units originally pledged. This is a genuine, accurate simplification the fungible-token model provides here, not a shortcut around the real legal distinction — real securities settlement systems can and do maintain lot-level identity in some record-keeping layers, but the SPL token layer itself has no such concept, so representing "equivalent" as "same mint, same amount, wherever it currently sits" is a faithful representation at this layer, not a simplified-away detail.

## Close-leg flow (happy path)

1. At term end (one business day later in the example trade), the Seller returns cash-plus-interest and the pledge is released, again as one atomic transaction with two sibling instructions.
2. **Cash-leg instruction:** the Seller's tokenized deposit balance is debited $10,001,013.89 (principal + Actual/360 interest), credited to the Buyer.
3. **Pledge-leg instruction:** the Depository's PDA `Revoke`s the delegate allowance over the Seller's custodied position, releasing the pledge; the trade-state account is marked closed. If the Buyer exercised rehypothecation mid-trade (see above), this instruction requires the trade-state account's collateral-location field to already show the collateral back at the Seller's custodied account — the Buyer must return equivalent tokens (any tokens of the same mint and amount, per the fungibility point above) before this instruction can succeed.
4. Same atomicity guarantee as the open leg: both instructions commit together or the transaction reverts entirely.

## Failure/unwind at open

**Resolves intent-001.md's open question:** "What happens on a failure at open (e.g. cash locks but the security-leg pledge fails, or vice versa)?"

**Resolved: this failure mode is structurally eliminated by the single-transaction design, not merely detected and unwound after the fact.** Because both legs are sibling instructions inside one atomic Solana transaction, "cash locks but pledge fails" (or the reverse) cannot occur as an observable intermediate state — if either instruction fails, the entire transaction reverts and nothing partially happens. This is a genuine POC finding worth stating plainly: it directly eliminates the real-world settlement-fails problem that traditional (non-atomic, T+1/T+2-style) markets manage only after the fact, via regimes like the U.S. Treasury/repo market's Fails Charge Trading Practice, which exists precisely because traditional settlement *can* fail on one leg without the other and needs an economic penalty regime to discourage it. This design has no equivalent need, by construction.

What remains genuinely in scope, since a failed transaction attempt is still a real operational event even though it never partially applies:

- Clear, distinguishable failure/error messaging for each realistic failure cause — insufficient cash, insufficient/ineligible collateral, stale or expired trade terms, timeout or counterparty-offline during signature collection.
- A defined retry/abandon operational path once a failure is surfaced (attempt the same transaction again once the underlying condition is fixed, or abandon the trade).

## Failure/unwind at close

**Resolves intent-001.md's open question:** "What if the security or cash-plus-interest doesn't correctly return at term end?" Unlike open, close has two structurally distinct default scenarios, both in scope.

### Seller default (fails to return cash-plus-interest at maturity)

Because the Buyer already holds an exercisable delegate allowance over the pledged collateral (granted atomically at open, see above), Seller default does not require the Seller's cooperation to resolve — this is exactly the point of MRA's right-of-use grant. Modeled as a distinct, named transaction shape, separate from the happy-path close:

1. **Callable only after the grace-period deadline: 1 business day past the scheduled close date**, not immediately at the scheduled close time. Real GMRA market practice treats a failure to deliver as becoming an event of default the day after delivery was expected — settlement fails are treated as an ordinary market feature, not automatically evidence of a credit event, so the tolerance is short and proportionate to the trade's own term rather than a multi-day or multi-week cure window. Given this POC's example trade is overnight, 1 business day past the scheduled close date is the grace-period deadline used for both default paths (see Buyer default, below, for the symmetric case).
2. Buyer-initiated: the Buyer instructs the Depository (as custodian holding the delegate allowance) to exercise it unilaterally against the Seller's pledged position.
3. Independent of any Seller signature — the whole point of the delegate mechanics above is that this path does not stall waiting on a non-cooperating counterparty.
4. Actual liquidation (market sale of the claimed collateral) is out of scope, matching intent-001.md's exclusion of trade pricing/negotiation logic — only the on-chain trigger/claim instruction (the Depository, exercising the delegate allowance, moving the pledged position to a Buyer-controlled or bank-custodied account) is in scope.

### Buyer default (fails to return equivalent securities at maturity, having exercised rehypothecation)

**Confirmed in scope, not a dormant-right-only model.** The POC models the Buyer actually exercising the right of use mid-trade (moving/reusing the pledged tokens, e.g. re-pledging or re-lending them into a second transaction), not merely holding an unexercised right — this is what MRA's "equivalent, not identical" securities concept exists to make legally possible, and it is the feature that makes rehypothecation meaningfully different from an ordinary custody hold.

This requires two things beyond the Seller-default path, both now concrete given rehypothecation is built as a real on-chain exercise (see Rehypothecation exercise flow (mid-trade), above) rather than merely asserted:

1. **Return of equivalent, not identical, tokens** — already resolved for free by SPL token fungibility (see Rehypothecation exercise flow, above): the pledge-release instruction only needs to confirm that tokens of the correct mint and amount are back in the Seller's custodied account, not that they are the original units.
2. **A mechanical, checkable default trigger.** Buyer default is defined concretely as: the pledged tokens have not been moved back from the Buyer's use account to the Seller's custodied account by the grace-period deadline (1 business day past the scheduled close date — the same deadline and rationale as Seller default, above). This is checked directly against the trade-state account's collateral-location field (see Token design, below), not an abstract or asserted condition — reusing the same grace-period/claim mechanism already designed for Seller default, just evaluated from the other direction: at the deadline, if the trade-state account still shows collateral at the Buyer's use account rather than returned to the Seller, the Seller (via the bank, its custodian for the cash leg) can trigger the counter-claim instruction against the Buyer's cash/collateral posted for the rehypothecated position.

As with Seller default, actual liquidation execution is out of scope — only the on-chain trigger is in scope.

## Token design

- **Cash leg:** reused unmodified from the tokenized-deposit-settlement project (Token-2022, its existing compliance extensions, existing fund/transfer/redeem flows) per intent-001.md's constraint. Not re-specified here.
- **Security leg standard:** base SPL Token (not Token-2022) on Solana devnet. Token-2022's Permanent Delegate extension is deliberately not used for the pledge mechanism (see Delegate-based right-of-use mechanics, above) — plain `Approve`/`Revoke` is sufficient and structurally correct for a scoped, per-trade grant.
- **Pledge delegate:** a Depository-program-owned PDA, `Approve`d by the Seller's custodied token account for the exact pledged face value, per trade. Not mint-wide, not permanent — scoped and revocable per the flows above.
- **Trade-state account:** an on-chain account (Depository program) recording each trade's terms — security identifier, face value pledged, cash amount, term, rate, day-count convention, current status (`open`/`closed`/`Seller-defaulted`/`Buyer-defaulted` — the latter two are terminal: once a default-claim instruction executes, the trade-state account permanently records which default occurred and does not transition further, since what happens downstream, i.e. liquidation, is out of scope, see Areas of concern), and a collateral-location field tracking whether the pledged tokens currently sit in the Seller's custodied account or in this trade's Buyer's-use account. The collateral-location field is what the Buyer-default check (see Failure/unwind at close, above) evaluates at the grace-period deadline — read by the close-leg, rehypothecation-exercise, and both default-path instructions to determine what's owed, where the collateral currently sits, and what's still exercisable.
- **Buyer's use account:** a Depository-controlled token account created per trade, not pooled across a Buyer's multiple positions — the destination for tokens moved via the rehypothecation exercise flow, above. Per-trade scoping preserves unambiguous attribution: the Buyer-default check depends on determining whether *this specific* trade's pledged tokens came back by *this specific* trade's deadline, which a pooled/commingled account would break without adding a redundant internal sub-accounting layer the per-trade trade-state account already provides (see Areas of concern).
- **Custody model:** the Seller's securities position and the Buyer's exercisable interest are both represented at the Depository, standing in for a DTC-participant-level custody position (per intent-001.md's named simplification) — the Seller is not the signing owner of the custodied account; the Depository is, consistent with the exclusivity resolution above.

## Technical approach

- **Chain:** Solana devnet, with both the bank's existing program and the new Depository program deployed to the same cluster — this shared-cluster choice is what makes single-transaction atomicity available (see Cross-system atomicity mechanism, above).
- **Depository program:** a new, minimal Rust/Anchor program implementing the pledge-grant instruction (open leg), the pledge-release instruction (happy-path close), and the two default-claim instructions (Seller-default unilateral claim; Buyer-default counter-claim) — each operating only on its own trade-state and delegate-allowance accounts, never CPI-ing into the bank's program.
- **Bank program:** reused as-is from the prior tokenized-deposit-settlement project. The cash-leg instructions used here (lock/transfer at open, debit/credit at close) are the same primitives that project already exposes; no modification to that program is in scope, per intent-001.md's constraint.
- **Transaction assembly:** each atomic transaction (open, happy-path close, Seller-default claim, Buyer-default counter-claim) is assembled by whichever institution initiates it, with both institutions' operator-authority signatures collected before submission. Durable nonces are the named (not yet built) mitigation if signature-collection latency exceeds the ~90s recent-blockhash window (see Cross-system atomicity mechanism).
- **Day-count/interest calculation:** Actual/360, computed off-chain (or in the Depository/bank program, whichever holds the trade-state term/rate fields) and included as an explicit amount in the cash-leg instruction — not recomputed independently on each side, to avoid the two institutions disagreeing on the owed amount at close.
- **Depository program authority:** a single key, not a multisig — the same scoping decision already made for the bank's own authorities in the prior project. Key management, custody, and governance of this authority are explicitly out of scope for this POC.

## Areas of concern

These are gaps that could block implementation without a follow-up decision:

- **Shared-cluster assumption is a real scope boundary, not a detail.** The entire atomicity mechanism depends on both institutions running programs on the same Solana cluster. A real-world Bank <-> Depository pair operating on genuinely separate ledgers (e.g., a bank's ledger and DTCC's Canton-based Tokenization Service) would need a fundamentally different atomicity mechanism — cross-chain interop, which intent-001.md explicitly defers as out of scope. This spec's atomicity guarantee does not generalize past the shared-cluster case without further design work.
- **`Approve` alone does not grant exclusivity.** As noted under Delegate-based right-of-use mechanics, the resolution here rests entirely on custody structure (the Depository, not the Seller, holds signing authority over the custodied account) rather than on any token-level enforcement preventing the underlying owner from moving funds. If a future iteration models the Seller as the direct signing owner of their own custodied account (rather than the Depository), this exclusivity property would need to be re-examined or re-solved differently.
- **Signature-collection latency and durable nonces are named, not built.** The ~90s recent-blockhash expiry window is real; if either institution's authorization workflow introduces latency near or beyond that window, the transaction will simply fail to land, and durable nonces would need to be implemented, not just documented, before that becomes a real operational path.
- **Day-count/interest calculation trust.** Whichever side computes the Actual/360 interest amount included in the close-leg cash instruction is implicitly trusted by the other side not to have miscalculated or misrepresented it — there is no independent on-chain recomputation/check of the owed amount before the transaction is signed.
- **Liquidation execution is entirely out of scope, on both default paths.** Only the on-chain trigger/claim instruction is modeled; what happens to the claimed collateral (or claimed cash/collateral, on the Buyer-default path) after the claim — an actual market sale — is not designed here at all, consistent with intent-001.md's exclusion of pricing/negotiation logic, but worth restating since "default handling" could otherwise be assumed to include it. This is also why `Seller-defaulted`/`Buyer-defaulted` are terminal trade-state statuses (see Token design, above) rather than transitioning to some later "resolved" status: the on-chain system has no way to know what liquidation eventually does, so tracking a further status would represent a fact this system doesn't actually observe.
- **Buyer default does not model GMRA's "mini close-out" netting mechanism — a named, deliberate gap, not an oversight.** In reality, a Buyer's failure to return equivalent securities at maturity does not automatically trigger a full event of default across every outstanding trade between the two counterparties. Real market practice (GMRA, and the equivalent mechanism under MRA) instead lets the non-defaulting party trigger a mini close-out scoped to just the one failed transaction — netting the repurchase price owed (cash principal plus accrued interest) against the defaulted securities' current market value into a single net cash payment — reserving a full close-out of every outstanding trade for more severe cases. This POC's Buyer-default path (see Failure/unwind at close, above) is a status-only trigger: it marks that the failure occurred, but implements neither the mini close-out nor the full close-out, since either would require a market-value input for the defaulted securities — a pricing/valuation input intent-001.md explicitly excludes as negotiation logic. Named here so this reads as a deliberate scope boundary, not a gap nobody noticed.
- **Away-account pooling is a deliberate, deferred simplification.** One Depository-controlled Buyer's-use account per trade (see Token design, above) is straightforward but doesn't scale — a Buyer with many simultaneous rehypothecated positions accumulates one account per trade rather than one pooled account across positions. Pooling (and the per-trade attribution problem it would reintroduce for the Buyer-default check — see Token design) is a reasonable production-scale optimization, deliberately not modeled in this POC.
