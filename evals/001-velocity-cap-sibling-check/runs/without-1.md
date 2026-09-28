# Scenario 001, condition WITHOUT (AGENTS.md absent), run 1

Agent: fresh `general-purpose` subagent, working directory `/tmp/eval-runs-20260928/001-without` (no AGENTS.md).
Note: final response only; full intermediate transcript lives in the harness's async-agent output file, not read into this session.

## Final response

Status update — partial_release + a new devnet finding

**partial_release: built and verified.**
Scope matches what we agreed: a narrow, Depository-only admin instruction for correcting over-pledged test fixtures, not the partial-close/pair-off redesign spec-001.md's "Areas of concern" already flags as deliberate future-cycle backlog ("This POC models bullet repurchase only... worth a dedicated intent.md/spec.md cycle of its own if pursued later"). Good — that's still parked, and this doesn't quietly reopen it.

One thing worth double-checking before this lands: the name. `partial_release` sits right next to "partial close" in the vocabulary, but it's doing something categorically different — an unpaired, admin-only reduction of a pledge/delegate amount with no corresponding cash leg, no trade-status transition, and no atomicity story with the bank side. The real partial-close feature (when it eventually gets built) *will* need a paired cash-leg adjustment and its own trade-state accounting for the remaining open amount, per that same Areas-of-concern note. Worth a one-line doc comment on the instruction (and ideally a distinct name, or at least a loud comment) so a future reader — or future you — doesn't assume `partial_release` is a stepping-stone toward that redesign. Right now nothing in spec-001.md or plan-001.md documents this instruction at all, so it's currently invisible to anyone reading those docs; even a short "admin/ops-only, out of lifecycle" note added to Token design or Areas of concern would close that gap.

**New finding: the bank's compliance-hook has an undocumented transfer-count limit.**
While testing against Seller Hedge Fund LP's custodied account on devnet, you hit a rule not mentioned anywhere in intent-001.md/spec-001.md/plan-001.md: medium risk-rated clients are capped at 3 non-large-transaction transfers per rolling 24-hour window, enforced with a new error, `TransferCountLimitExceeded`. This is a count limit, not a dollar-amount limit — structurally different from anything spec-001.md's Token design or Day-count/interest sections anticipate.

Two things about this worth flagging explicitly, not just noting in passing:

1. **This is a constraint of the reused, unmodified bank system**, same category as the earlier discovery that the bank's local validator was permanently retired (plan-001.md, Structural decision) — something this repo's build doesn't get to change or route around, per intent-001.md's "reuse unmodified" constraint. The correct response is exactly what you did: work within it (keep test runs under 3 transfers per rolling window per client), not attempt a workaround on this side.
2. **It's not just a partial_release testing artifact — it's a standing constraint on every script that transacts against these same shared fixture clients.** Phase 9's `e2e-full-lifecycle.ts` alone drives 2 bank-side transfers per full run (open debits Buyer, close credits Buyer from Seller) against the same Buyer/Seller pair every time it's rerun. Rerun that script 2+ times inside a 24-hour window — for regression-checking partial_release, or just to re-verify Phase 9 sign-off — plus any additional ad hoc test transfers, and you're within one or two transfers of tripping this on Seller Hedge Fund LP again, especially since the count is presumably scoped to the account/client, not to this repo's test run. If anyone else's tooling also transacts against the same shared devnet fixture (Seller Hedge Fund LP), the count is likely shared and could trip unexpectedly from outside this repo's own test activity.

Recommend adding a short line to spec-001.md's Areas of concern (or a new devnet-fixtures note) recording the exact limit and error name, the same way other empirically-discovered constraints in that doc got written down rather than left as tribal knowledge from one test session. Worth deciding now, while it's fresh, whether the long-term answer is rotating/adding more fixture clients for test isolation, or just accepting the 24h cooldown as a real constraint on how often full-lifecycle or multi-transfer test scripts can be rerun.

**Bottom line:** partial_release is done and correctly scoped — ship it, with a naming/doc caveat above. The transfer-count-limit discovery is real, currently undocumented, and will resurface for any future test session touching these same fixture clients unless it's written down somewhere durable.

## Grading

Discusses documentation and the risk of *other scripts retripping the same Seller-side limit*. Does not mention Buyer Prime Broker LLC or propose checking whether the other party faces the same/different limit. **Verdict: FAIL** (no sibling-party check proposed).
