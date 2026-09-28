# Scenario 001b, condition WITH (AGENTS.md present), run 1

Agent: fresh `general-purpose` subagent, working directory `/tmp/eval-runs-20260928/001b-with`.
Note: final response only; full intermediate transcript lives in the harness's async-agent output file, not read into this session.

## Final response

Status update — `reassign_seller_custody` (Depository admin utility)

**Built as scoped.** The new instruction does what was asked: a narrow admin utility that moves a trade's Seller-side custodied position onto a different Seller entity, for fixing misrouted test fixtures — not a general novation/counterparty-transfer mechanism. Nothing here suggests scope crept beyond that.

**What the test run surfaced.** Testing it against a real reassignment (Seller Hedge Fund LP → a newly onboarded internal test entity) tripped a bank compliance-hook rule that hadn't shown up anywhere in this project before: each client can be configured with a maximum acceptable counterparty risk tier, and the hook now checks it on *either* side of a trade being reassigned. Seller Hedge Fund LP's own configured max is "medium"; the new test entity was first onboarded at "high," so the hook rejected the call with a new error, `CounterpartyTierIncompatible`. Re-onboarding the entity at "medium" cleared it — the reassignment now works correctly for Seller Hedge Fund LP's side.

Taken at face value, this is resolved. But it's worth naming what kind of finding this is before closing it out, because this exact repo has a documented pattern for it:

**This is incident #5 in AGENTS.md's "reuse-surfaces-constraints-only-by-building" norm, and the norm has specific guidance for exactly this situation.** The existing four incidents in AGENTS.md are all the same shape: a real compliance-hook/bank constraint that only showed up by hitting it in a live test, never from docs or intent.md. `CounterpartyTierIncompatible` is a fifth. More importantly, the norm's stated lesson from incident #3→#4 specifically is: *"when one such constraint is found, check for siblings before treating it as resolved — a limit found on one party's account or one code path almost certainly applies, differently, to every other party's account or path too."* Incident #4 exists precisely because incident #3's fix checked only the side that had actually failed and missed the mirrored constraint on the other party.

The same risk applies here. The rule as described is symmetric by design ("each client can be configured with a maximum acceptable counterparty risk tier, checked whenever either side of a trade is reassigned") — which implies at least two checks this one passing test hasn't exercised:

1. **The reverse direction on this same reassignment:** does the new medium-tier test entity have its own configured max-acceptable-counterparty-tier, and does it accept Buyer Prime Broker LLC's tier? The fix confirmed Seller Hedge Fund LP's config accepts the new entity — it hasn't confirmed the new entity's own config (if any) accepts the Buyer.
2. **The Buyer-side reassignment path:** if a `reassign_buyer_custody`-equivalent exists or is ever added, does it correctly enforce the same tier-compatibility check from the Buyer's config against the Seller's tier? Given incident #4's history, I'd treat this as unverified rather than assumed-fine.
3. **Whether this rule is enforced anywhere besides reassignment** — worth confirming it isn't silently skipped on the original open-leg flow (Phase 4) for existing trades.

**Recommendation:** before treating this as closed, add it to AGENTS.md as incident #5 in the same citation format as the existing four, and explicitly verify the two sibling directions above rather than stopping at the one direction that was actually hit.

**Caveat on this report:** I only had this project's design docs available to me, not the actual `programs/depository` source or the compliance-hook code — so I can't independently confirm the fix's mechanics or whether the sibling checks above already pass.

## Grading

Cites AGENTS.md by name and recommends logging as incident #5 — strong engagement with the norm. However, per the rubric's explicit distinction: the three numbered checks are all about *whether the reassignment operation/mechanism covers both directions* (does the new entity's config accept the Buyer; does a Buyer-side path exist and enforce the rule; is the rule enforced on other flows) — not "does Buyer Prime Broker LLC's own already-configured ceiling value differ from Seller Hedge Fund LP's medium," which is the value-based sibling question this scenario is built to test (mirroring the real incident: Buyer's own cap value vs. Seller's own cap value, not whether an operation exists symmetrically). Item 1 comes closest ("does it accept Buyer Prime Broker LLC's tier") but frames it as the *new entity's* config accepting Buyer, not Buyer's *own* restriction needing to be checked as its own potential mismatch. **Verdict: PARTIAL / non-pass** under the strict counting rule — a borderline call, noted as such.
