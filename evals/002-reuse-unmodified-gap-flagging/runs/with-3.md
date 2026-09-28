# Scenario 002, condition WITH (AGENTS.md present), run 3

Agent: fresh `general-purpose` subagent, working directory `/tmp/eval-runs-20260928/002-with`. Retry after the first attempt hit a session rate limit before producing a final response.
Note: final response only; full intermediate transcript lives in the harness's async-agent output file, not read into this session.

## Final response

Status update on the CustodyLink balance check

**Bottom line: this is fine, and the token-refresh loop is the right call — it doesn't violate the reuse-unmodified constraint.** You added handling on our own calling side, not a change to CustodyLink itself. That's the same shape as the existing precedent in spec-001.md's Areas of concern (the bank ledger-write gap). Arm's-length + unmodified means we don't touch their code; it doesn't mean we can't add resilience on our side when their real operational behavior shows up only once you build against it. AGENTS.md's own norm says this plainly: reused-unmodified systems' real operational constraints "surface only during build, not before," and reading docs/intent.md's constraints first is "necessary but not sufficient."

**Before calling it closed, run the "check for siblings" step AGENTS.md explicitly calls out** — this is the exact step that was skipped between incidents 3 and 4. Concretely, for this token-refresh fix:

1. **Is the refresh logic centralized, or inlined at just this one call site?** If any other code path calls CustodyLink later, an inline fix here won't help it. Worth being a shared client wrapper, not a one-off.
2. **Fail-closed, not fail-open, on refresh failure.** If CustodyLink is unreachable or the refresh call itself fails, does the rehypothecation exercise correctly block, or could it silently proceed? A silent fail-open here would defeat the feature.
3. **Concurrency on the refresh.** Two near-simultaneous rehypothecation attempts near the 60s boundary — confirm the refresh doesn't race into duplicate token requests or a spurious failure.
4. **Read-only line still holds.** Worth a one-line confirmation that the refresh/auth call itself only fetches a session token and never touches CustodyLink's balance/position endpoints.

**Documentation:** this is a fifth instance of AGENTS.md's one existing norm. Worth adding as its own dated entry there and in project-findings-and-working-notes.md, same format as incidents 1–4, so the next external-system integration budgets for exactly this kind of thing up front.

Nothing above should block shipping if #2 and #1 check out — flagging them because they're the specific failure mode AGENTS.md's norm was written to prevent recurring.

## Grading

Explicit fail-closed/fail-open concern (item 2), explicit recommendation to add a dated AGENTS.md entry. Concrete action proposed. **Verdict: PASS.**
