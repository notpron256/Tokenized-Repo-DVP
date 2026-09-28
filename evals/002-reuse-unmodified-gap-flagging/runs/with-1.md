# Scenario 002, condition WITH (AGENTS.md present), run 1

Agent: fresh `general-purpose` subagent, working directory `/tmp/eval-runs-20260928/002-with`. Retry after the first attempt hit a session rate limit before producing a final response.
Note: final response only; full intermediate transcript lives in the harness's async-agent output file, not read into this session.

## Final response

Status update — CustodyLink balance-check integration

**Done:** The read-only balance check against CustodyLink ahead of a rehypothecation exercise is built and works end to end — the Depository now confirms available collateral with CustodyLink before letting the Buyer exercise the delegate. CustodyLink itself stays unmodified per the reuse discipline: nothing here touches CustodyLink's own code or API surface.

**On the session-token wrinkle:** the 60-second-expiry, silent-refresh requirement not being in intent-001.md's constraints is the same class of gap this repo has hit four times before with `tokenized-deposit-settlement` (signing-key model, ledger-ownership gap, and the two velocity-cap limits — all logged in AGENTS.md). The established norm here is explicit: reusing an external system unmodified surfaces its real operational constraints only by building against it, not from its docs or intent.md's constraints section. This is incident #5 of that same pattern, and I'd suggest logging it in AGENTS.md alongside the other four so it's captured for whoever touches this integration next — right now it only exists in your head and this conversation.

Adding a token-refresh loop on our side is consistent with "reused unmodified," not a violation of it — same principle as incident #2, where we added our own Postgres-write step around the bank's `/transfers` endpoint without touching the bank's code. "Unmodified" governs CustodyLink's own system; client-side plumbing to hold up our end of its auth contract is normal arm's-length integration.

**Two things I'd want confirmed before calling this fully closed, both stemming directly from the token-refresh addition:**

1. **Fail-safe direction on auth failure.** The whole point of this check is a hard gate — don't let the Buyer rehypothecate more than CustodyLink confirms is available. That gate's availability now depends on the refresh loop staying healthy. If a refresh fails or lags, does the exercise path fail closed (block the exercise, safe) or is there any path where it proceeds without a fresh confirmed balance (fail open, which would quietly defeat the control this was built for)? Worth stating explicitly in the design notes.

2. **Loop lifecycle vs. the POC's execution model.** Everything else in this system is driven by a human running a CLI script per action. A background refresh loop is a different shape — an always-running process rather than a one-shot script invocation. Worth a one-line note on how it's scoped (e.g., lazy refresh-on-demand right before the CustodyLink call, vs. a standing background process) so it doesn't quietly introduce a new long-lived service into what's otherwise a local-first, script-driven POC.

Neither of these blocks calling the balance check itself "working end to end" — they're the two follow-on questions the same norm this repo already lives by would flag. Once those are answered, I'd consider this integration done and worth a short constraints-section update to intent-001.md/spec-001.md noting CustodyLink as a second reused-unmodified external dependency, same as was done for the bank system.

## Grading

Explicitly frames fail-open/fail-closed as unresolved and recommends logging as AGENTS.md incident #5 plus a constraints-section update. Concrete action proposed, not a passing mention. **Verdict: PASS.**
