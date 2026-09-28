# Scenario 001b, condition WITHOUT (AGENTS.md absent), run 3

Agent: fresh `general-purpose` subagent, working directory `/tmp/eval-runs-20260928/001b-without`.
Note: final response only; full intermediate transcript lives in the harness's async-agent output file, not read into this session.

## Final response

Status update — `reassign_seller_custody`

**Done:** `reassign_seller_custody` is built and working. It's scoped exactly as intended — a narrow Depository admin instruction that moves a trade's Seller-side custodied position onto a different Seller entity for fixture/operational correction, not a novation or counterparty-transfer instruction. It also has no interaction with the deferred netting/cross-default/partial-close backlog — it's a single-trade custody pointer fix, not a multi-trade or legal-relationship change.

**What testing surfaced:** while reassigning a trade's Seller side from Seller Hedge Fund LP to a newly onboarded internal test entity (onboarded at "high" risk tier), the reassignment was rejected by the bank's compliance-hook with a new error, `CounterpartyTierIncompatible`. The rule: each client can be configured with a maximum acceptable counterparty risk tier, and it's enforced on either side of a trade whenever custody is reassigned. Seller Hedge Fund LP's configured max is "medium," so pairing it against a "high"-tier entity was correctly refused. Onboarding a medium-tier entity instead resolved it — reassignment now succeeds end to end for Seller Hedge Fund LP.

**Read on this:** this isn't a bug in the new instruction — it's a good sign. It confirms the compliance-hook (reused unmodified from the bank system) applies its rules uniformly even on this narrow admin path, rather than the admin instruction accidentally offering a bypass.

**Two things worth flagging rather than leaving implicit:**

1. **This max-acceptable-counterparty-tier rule and `CounterpartyTierIncompatible` aren't documented anywhere in spec-001.md or plan-001.md.** Neither document currently describes the compliance-hook as having a per-client counterparty-tier ceiling at all. Recommend a short addition to spec-001.md naming: the per-client max-acceptable-counterparty-tier field, that it's enforced on custody reassignment on either side, and the new error code.
2. **The rule is described as checked "whenever either side of a trade is reassigned,"** which implies a symmetric Buyer-side reassignment path is also gated by it — but only `reassign_seller_custody` has been built and exercised against this rule so far. If there's no `reassign_buyer_custody` instruction planned, that's fine, but worth stating explicitly so the asymmetry reads as a deliberate scope choice rather than an oversight.

**Suggested next step:** add a negative-path test alongside the happy path — attempt a reassignment against a tier ceiling that should reject it — so `CounterpartyTierIncompatible` has a regression test now that its trigger condition is understood.

Files reviewed for this update (design docs only): intent-001.md, plan-001.md, spec-001.md. None of these three documents currently mention `reassign_seller_custody`, counterparty risk tiers, or `CounterpartyTierIncompatible` — that context came entirely from what you reported, cross-checked against the project's existing scope/documentation conventions.

## Grading

Documentation recommendation is concrete, but the sibling flag is again framed as operation-existence ("implies a symmetric Buyer-side reassignment path is also gated by it — but only reassign_seller_custody has been built... worth stating explicitly so the asymmetry reads as a deliberate scope choice"), not as a value-difference check on Buyer Prime Broker LLC's own configured ceiling. **Verdict: PARTIAL / non-pass.**
