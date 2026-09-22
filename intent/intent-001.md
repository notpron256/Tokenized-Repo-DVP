# Intent 001: Cross-Institution Atomic DvP Settlement

Author: Sebastian Higgs
Status: draft

## Problem

Individual banks issuing their own tokenized deposits create closed, siloed systems, useful only for that bank's own customers. Exploring cross-institution interoperability for pure domestic cash payments revealed this is largely redundant against existing real-time gross settlement rails (FedNow, RTP), which already provide instant, final, prefunded, 24/7 cash settlement between banks — a blockchain-based cash bridge adds significant build complexity for comparatively thin incremental value (mainly programmability) against an already-excellent incumbent.

The genuinely differentiated, currently underexplored value is atomic Delivery-versus-Payment (DvP): swapping cash against a fundamentally different asset type (a security) atomically, in a single indivisible transaction. RTGS rails structurally cannot do this — they only ever touch the cash leg.

Real capital-markets volume data supports this focus: Broadridge's Distributed Ledger Repo platform alone processes over $350 billion per day in tokenized repo settlement, dwarfing current cross-border stablecoin settlement volume (Visa and Mastercard combined, roughly $20-30 billion annualized) — repo/DvP tokenization is where real, current, provable value already sits.

DTCC itself is moving toward tokenized securities (Broadridge's DLX platform connects to the DTCC Tokenization Service via Canton), meaning the genuinely hard, valuable problem is atomic settlement between a bank's tokenized cash ledger and a depository's tokenized securities ledger — two independently-operated systems that have never shared a database, historically coordinated only through a settlement cycle with a real, non-atomic window where one leg could complete without the other.

## Proposed outcome

A genuine cross-institution atomic DvP settlement system modeling a real repo trade — cash leg at a bank (reusing the existing tokenized-deposit-settlement project, unmodified, as the bank side) and security leg at a minimal Depository counterparty, standing in for DTC/a prime broker's DTC-participant-level custody position.

Both counterparties to the trade — the prime broker as Buyer (lends cash, receives the security interest and right of use over the collateral) and the hedge fund as Seller (posts securities as collateral, borrows cash, obligated to repurchase equivalent securities at the close leg) — are modeled as clients of the SAME bank. The genuine cross-institution complexity is specifically Bank <-> Depository (two structurally different institution types), not bank-to-bank, deliberately avoiding re-introducing the interbank cash-settlement problem already explored and set aside.

Models the full repo lifecycle: the open leg (cash moves one way, a security interest is granted the other way, atomically) and the close/unwind leg (the security interest is released, cash-plus-repo-interest returns, atomically).

Deliberately takes the harder legal/technical path: modeled on US law (the SIFMA Master Repurchase Agreement, governed by New York law) rather than the simpler English-law GMRA, since the US is the largest capital market and US Treasuries are the most heavily repo'd collateral globally — and because MRA's pledge/security-interest structure is a harder, more interesting design problem than GMRA's simpler title-transfer structure.

## Affected users and systems

- Two clients of the same bank, under MRA terminology: the prime broker as Buyer (lends cash, receives the security interest and right of use over the collateral) and the hedge fund as Seller (posts securities as collateral, borrows cash, obligated to repurchase equivalent securities at the close leg).
- The bank's existing tokenized deposit system (reused as-is) for the cash leg.
- A new, deliberately minimal Depository counterparty for the security leg, representing a DTC-participant-level custody position directly — deliberately simplifying away the real intermediate tier where a hedge fund's position technically sits at its prime broker's own internal books before that broker's aggregated position reaches DTC.
- Two genuinely independent systems (bank ledger, depository ledger) with no shared database, requiring real cross-system atomic coordination.

## Design principles

- This is fundamentally a distributed-systems atomicity problem wearing a securities-settlement costume. The cash leg and security leg must move together, all-or-nothing, at both open and close — a partial failure (one leg completing without the other) is the exact settlement risk DvP exists to eliminate.
- Legal structure: under the MRA (US/NY law), a repo is a security interest / pledge, NOT a title transfer (unlike GMRA/English law, where title genuinely transfers). Legal title to the security stays with the original owner throughout; the cash lender (Buyer) receives a perfected security interest plus a general right of use (including rehypothecation rights) over the security — functioning economically like ownership without being legal title.
- This "right of use without ownership transfer" maps directly onto the delegate pattern already built and proven in the prior tokenized-deposit-settlement project (Permanent Delegate) — the security-leg mechanics should be modeled as a delegate-style grant of rights to the cash lender, not a straightforward mint/transfer/burn ownership swap.
- The pledge's real-world enforceability rests on Bankruptcy Code safe harbors (11 U.S.C. § 101(47)'s definition of a qualifying "repurchase agreement"; § 559 and § 362(b)(7) exempting it from the automatic stay in bankruptcy) — this legal machinery is assumed/relied upon as a real-world fact, not re-implemented or verified in code.
- Both legs of the repo lifecycle (open and close/unwind) must be modeled, each independently atomic.
- Legal structure choice (MRA vs. GMRA) is deliberate, not accidental: MRA/NY law is chosen as the harder, more US-market-relevant path; GMRA/English law is noted as the simpler alternative (true title transfer, no rehypothecation or perfection complexity to reason about). A full feature-comparison matrix between MRA and GMRA is a REQUIRED deliverable in spec.md — flag this explicitly so it is not forgotten.

## Constraints

- Reuse the existing tokenized-deposit-settlement project, unmodified, for the bank/cash side.
- Build a new, deliberately minimal Depository counterparty for the security side — not a second full bank, and not modeling DTC's real multi-tier participant/customer structure beyond the one named simplification (Depository counterparty = DTC-participant-level position directly).
- Trade agreement, pricing, and negotiation logic (how the repo rate and haircut are agreed) are explicitly out of scope. The POC begins from an already-agreed trade (amount, security, term, rate) and focuses purely on the atomic settlement mechanics of executing and unwinding it.
- Real perfection of the security interest (UCC Article 8/9 "control" mechanics) and reliance on Bankruptcy Code safe harbors are treated as real-world assumed facts, not re-implemented or verified in code — named as a deferred legal-analysis item, alongside the required MRA/GMRA comparison matrix.
- Local-first development before any deployment consideration, same discipline as prior projects.
- The earlier bank-to-bank interoperability framing (a consortium model, prefunded interbank cash settlement) is explicitly superseded by this redesign and no longer applies to this project's scope.

## Open questions

- Exact on-chain mechanics for granting the cash lender/Buyer a delegate-style "right of use" over the pledged security — how should this differ structurally from how Permanent Delegate worked in the prior project?
- What definitively and atomically ties the cash-leg lock/settlement to the security-leg pledge grant across two genuinely separate systems with no shared database — what's the actual cross-system coordination mechanism?
- What happens on a failure at open (e.g. cash locks but the security-leg pledge fails, or vice versa) — how is this detected and safely unwound, preserving the all-or-nothing principle?
- Same question for close/unwind — what if the security or cash-plus-interest doesn't correctly return at term end?
- What concrete example trade (amount, security type, term, repo rate, haircut) should ground the POC, even though the negotiation logic that would normally produce these numbers is out of scope?
