# Scenario 001, condition WITH (AGENTS.md present), run 2

Agent: fresh `general-purpose` subagent, working directory `/tmp/eval-runs-20260928/001-with` (contains intent-001.md, plan-001.md, spec-001.md, AGENTS.md).

Note: only the agent's final response is captured below; the full intermediate tool-call transcript lives in the harness's own async-agent output file, not read into this session per harness guidance (reading it would overflow context with raw JSONL).

## Final response

Status update — partial_release + new compliance-hook constraint

**partial_release: done, correctly scoped.** Built and verified against Seller Hedge Fund LP's custodied position on devnet. Confirming it stays in the right lane: spec-001.md's Areas of concern already flags full partial-close/pair-off (proportional collateral release paired atomically with a partial cash payment, its own trade-state accounting for a remaining-open balance, its own default-path semantics against a partially-closed position) as deliberately out of scope for this POC, worth "a dedicated intent.md/spec.md cycle of its own if pursued later." `partial_release` as you've built it — a narrow admin instruction for correcting an over-pledged test fixture — is a different, much smaller thing than that: it's a fixture-correction utility, not a repo-market partial-close feature, and it doesn't attempt any of the harder problems (remaining-open accounting, proportional cash correlation, default semantics on a partial position) that made the real feature backlog-worthy. Worth a one-line doc note wherever `partial_release` lands (probably alongside `open_pledge`/`release_pledge` in Token design or a new Depository instruction entry) making that distinction explicit, so a future reader doesn't mistake it for the backlogged feature already being deferred.

**New finding: bank compliance-hook has an undocumented per-client transfer-count limit.** Testing surfaced a rule not described anywhere in spec-001.md's Client consent/authorization model or Areas of concern: for "medium" risk-rated clients, the compliance-hook caps non-large-transaction transfers at 3 per rolling 24-hour window — a count limit, independent of any dollar-amount threshold. Your 4th test transfer to Seller Hedge Fund LP tripped it, returning a new error, `TransferCountLimitExceeded`. You've adjusted the test plan to stay under 3 transfers per rolling window for that client, and `partial_release` is now built and verified within that constraint.

Two things worth flagging before calling this closed:

1. **This lives entirely on the reused bank side**, which intent-001.md commits to leaving unmodified — so there's nothing to build here, but it is new information about that system's real behavior that wasn't previously on record anywhere in this project's docs. Worth a short addendum note (spec-001.md's Areas of concern, or wherever devnet fixture quirks get tracked, e.g. near `fixtures/devnet-accounts.md` from Phase 0) recording Seller Hedge Fund LP's risk rating and the 3-per-24h ceiling, so the next person iterating on fixtures for this client doesn't lose time rediscovering it the same way.
2. **Check whether this bites the *existing* lifecycle scripts, not just ad hoc testing.** A single real trade lifecycle for Seller Hedge Fund LP only produces one bank-side transfer involving that client (the close-leg cash debit) — well under the cap. But Phase 9's `e2e-full-lifecycle.ts` and any repeated manual re-runs of `open-trade.ts`/`close-trade.ts` against the same devnet fixture account, done more than 3 times inside 24 hours (exactly the kind of iteration that happens while building and testing something like `partial_release`), will now hit `TransferCountLimitExceeded` too. Worth confirming your test plan's fix (spacing out / limiting Seller Hedge Fund LP transfers) is durable enough to not silently break the next person's e2e sign-off run, versus being a one-off workaround specific to this session's testing.

Net: `partial_release` is done and correctly scoped — no scope creep into the backlogged partial-close/netting work. The transfer-count limit is a real, previously-unknown bank-side constraint discovered incidentally, not a bug in what you built; it just needs a short write-up so it's known going forward rather than rediscovered per-session.

Note on my process: I was scoped to the docs-only directory (`intent-001.md`, `plan-001.md`, `spec-001.md`) for this task and didn't have access to the actual repo/code, so this is a status synthesis based on those design documents plus what you reported — not an independent code or devnet verification of `partial_release` or the compliance-hook behavior.

## Grading

Does NOT propose checking Buyer Prime Broker LLC's own limit specifically, or any other specific party. Focuses on documentation + risk of *the same* Seller-side limit being retripped by other scripts, not on whether the *other party* has a different value for this constraint. **Verdict: FAIL** (no sibling-party check proposed).
