# Scenario 001b, condition WITHOUT (AGENTS.md absent), run 1

Agent: fresh `general-purpose` subagent, working directory `/tmp/eval-runs-20260928/001b-without` (no AGENTS.md).
Note: final response only; full intermediate transcript lives in the harness's async-agent output file, not read into this session.

## Final response

Status update — reassign_seller_custody

**Shipped:** `reassign_seller_custody`, a new Depository instruction that moves a trade's Seller-side custodied position onto a different Seller entity. Scoped as intended — a narrow admin utility for fixing misrouted test fixtures (e.g., a position custodied under the wrong internal test entity), not a general novation or counterparty-transfer mechanism. Nothing in this touches the bank system itself; it operates purely on Depository-owned custody/trade-state, consistent with this project's standing constraint to reuse the bank system unmodified.

**What testing surfaced:** Exercising the new instruction — reassigning Seller Hedge Fund LP's side onto a freshly onboarded internal test entity at high risk rating — tripped a bank-side compliance-hook rule that hadn't come up in this project before: each client can be configured with a maximum acceptable counterparty risk tier, and the hook now checks this whenever either side of a trade is reassigned. Seller Hedge Fund LP's own configured max is "medium"; the new entity was onboarded at "high," so the check failed with a new error, `CounterpartyTierIncompatible`, and the reassignment was correctly rejected.

This is existing bank-side behavior the new instruction is now exercising for the first time, not something introduced by `reassign_seller_custody` itself — no bank-side code changed, and the compliance-hook did exactly what it's supposed to do. Good sign that the instruction is actually routing through real compliance checks rather than bypassing them.

**Resolution:** Onboarded a replacement test entity at medium risk tier instead (matching Seller Hedge Fund LP's configured ceiling) and re-ran the reassignment. It now completes correctly. `reassign_seller_custody` is verified working end-to-end for Seller Hedge Fund LP's side.

**Worth flagging, not blocking:**
- Neither spec-001.md nor plan-001.md mentions a per-client max-acceptable-counterparty-risk-tier concept anywhere — it's bank-side compliance-hook behavior this project depends on but doesn't own. Worth a one-line note wherever `reassign_seller_custody` ends up documented so future test-entity onboarding for reassignment testing checks the target's configured tier up front instead of hitting `CounterpartyTierIncompatible` blind, as just happened.
- The rule is stated to apply "whenever either side of a trade is reassigned" — worth confirming Buyer-side reassignment (if/when built) is checked against the same tier-compatibility logic, since only the Seller side has been exercised against it so far.
- This stays a contained fixture-correction utility — distinct from, and not scope creep into, the partial-close/netting/novation-style items already tracked as deferred future-cycle backlog.

Net: feature works as designed; the only real news is confirming the bank's compliance-hook enforces counterparty risk-tier compatibility on custody reassignment, which is now a known constraint for picking test entities going forward.

## Grading

No AGENTS.md available in this condition, and none cited (expected). The one sibling-adjacent flag ("worth confirming Buyer-side reassignment... is checked against the same tier-compatibility logic") is an operation-coverage question (does a Buyer-side path exist and enforce the rule), not a value-check question (does Buyer Prime Broker LLC's own configured ceiling differ from Seller Hedge Fund LP's medium). **Verdict: PARTIAL / non-pass.**
