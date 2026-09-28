# Scenario 001b, condition WITH (AGENTS.md present), run 2

Agent: fresh `general-purpose` subagent, working directory `/tmp/eval-runs-20260928/001b-with`.
Note: final response only; full intermediate transcript lives in the harness's async-agent output file, not read into this session.

## Final response

Status update — reassign_seller_custody

**Built and working.** `reassign_seller_custody` is done: a narrow Depository admin instruction that moves a trade's Seller-side custodied position onto a different Seller entity, scoped to fixing misrouted test fixtures rather than any general novation/counterparty-transfer capability. Nothing in intent-001.md or spec-001.md describes novation or reassignment at all, so this instruction is correctly being treated as an out-of-band admin utility, not an extension of the modeled repo lifecycle.

**What you hit while testing it.** Reassigning the trade's Seller side from Seller Hedge Fund LP onto a newly-onboarded high-risk-tier internal test entity tripped a compliance-hook rule not previously seen in this project: each client can carry a configured maximum acceptable counterparty risk tier, and the hook now checks it on any reassignment of either side of a trade. Seller Hedge Fund LP's own configured ceiling is "medium"; the new entity was onboarded at "high," so the call was rejected with `CounterpartyTierIncompatible`. Onboarding a medium-tier entity instead and re-running the reassignment now succeeds.

This is another instance of the exact pattern already logged four times in AGENTS.md: a real bank-side compliance-hook constraint that was never written down anywhere in spec-001.md or the bank's own docs, surfaced only by building and running against the live hook. It's worth adding as incident 5 there, with the same citation discipline the existing four entries use.

**One thing I'd check before calling this closed, per AGENTS.md's own stated norm ("when one such constraint is found, check for siblings before treating it as resolved").** The fix so far has only been exercised in one direction — a Seller-side reassignment, verified against Seller Hedge Fund LP's own configured ceiling, with a single passing case (medium ceiling, medium entity). Two open questions that case doesn't actually distinguish:

1. **Which party's ceiling does the hook really check?** Is it the ceiling of the client being replaced (Seller Hedge Fund LP), the ceiling of the counterparty staying in the trade (Buyer Prime Broker LLC), or both? Your passing test had both sides effectively medium, so it can't tell these apart. Worth confirming directly against the compliance-hook source rather than inferring from one green run.
2. **Does the Buyer-side path enforce the same rule?** The hook is described as checking "whenever either side of a trade is reassigned," but only the Seller side has actually been exercised against it. If there's a symmetric `reassign_buyer_custody` (or equivalent), it should get the same negative-then-positive test — onboard a high-tier entity, confirm rejection, onboard a medium-tier one, confirm it clears — before this is treated as generally working rather than working for the one path that happened to be tested first.

Net: the instruction itself is done and the immediate rejection is resolved for the case you hit. Before closing it out, I'd confirm the tier-ceiling semantics against the hook's actual source and run the mirror-image test on whichever side wasn't just exercised, then fold the finding into AGENTS.md as its own incident.

## Grading

Cites AGENTS.md and its norm explicitly. Both numbered points are about the *check mechanism's own semantics* (which party's ceiling is actually checked; whether a symmetric Buyer-side operation exists and works) — not about whether Buyer Prime Broker LLC's own configured ceiling value might differ from Seller Hedge Fund LP's medium. This is the "operation coverage/mechanism" question the rubric explicitly distinguishes from the "does the other party's value differ" question. **Verdict: PARTIAL / non-pass.**
