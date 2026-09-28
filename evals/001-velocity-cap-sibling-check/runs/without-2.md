# Scenario 001, condition WITHOUT (AGENTS.md absent), run 2

Agent: fresh `general-purpose` subagent, working directory `/tmp/eval-runs-20260928/001-without`.
Note: final response only; full intermediate transcript lives in the harness's async-agent output file, not read into this session.

## Final response

Status update — `partial_release` + new compliance-hook finding

**1. Scope check — this stayed correctly separate from the backlog.** `partial_release`, as built, is the narrow thing: an admin instruction to release part of a pledge to correct an over-pledged test fixture. That's distinct from spec-001.md's actual out-of-scope "partial close" item (Areas of concern: proportional collateral release paired atomically with a partial cash payment, its own remaining-open-amount trade-state accounting, its own default-path implications for a partially-closed position) — that redesign is still the deliberate future-cycle backlog item, untouched by this. Good that the two didn't get conflated; worth stating explicitly since they sound similar.

**2. The new compliance-hook rule is real, and it's a sibling to a pattern this repo has hit before.** `TransferCountLimitExceeded` on the 4th test transfer to Seller Hedge Fund LP's custodied account — medium-risk clients capped at 3 non-large-transaction transfers per rolling 24h. This is a new dimension, not a restatement of the two dollar-velocity caps already on record.

**3. Before treating this as resolved, it needs the same "check for siblings" step** — and this is exactly the situation that produced incident 4 in the first place. Staying under 3 transfers against Seller Hedge Fund LP proves `partial_release` works; it doesn't establish what "non-large-transaction" means as a threshold, or whether the rolling window is per-account or per-client-across-accounts.

**4. This is also an operational property of the utility itself, not just a test-plan footnote.** `partial_release` exists to correct over-pledged fixtures on an ongoing basis, likely against the same handful of test accounts repeatedly. A 3-per-24h count cap on Seller Hedge Fund LP is a standing constraint on how often the utility can be run against that account, not a one-time snag you route around once.

**5. Recommend logging this in project docs**, same format as other discovered constraints — it's the same root cause pattern (a business-rule limit in the reused bank system, surfaced only by testing against it, absent from anything read ahead of time).

Bottom line: `partial_release` itself is done and correct. Worth documenting the count limit's threshold semantics and rolling-window scope before calling this fully closed.

## Grading

Does not mention Buyer Prime Broker LLC or propose checking a different party's own limit. Focuses on threshold semantics, window scope, and documentation of the same Seller-side finding. **Verdict: FAIL** (no sibling-party check proposed).
