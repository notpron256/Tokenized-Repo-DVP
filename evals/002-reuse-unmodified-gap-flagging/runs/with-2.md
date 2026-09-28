# Scenario 002, condition WITH (AGENTS.md present), run 2

Agent: fresh `general-purpose` subagent, working directory `/tmp/eval-runs-20260928/002-with`. Retry after the first attempt hit a session rate limit before producing a final response.
Note: final response only; full intermediate transcript lives in the harness's async-agent output file, not read into this session.

## Final response

Status: CustodyLink balance-check integration — done, works end to end, but flagging one thing before we call it closed.

**What's built:** Read-only balance check against CustodyLink gating the rehypothecation exercise — Depository now confirms available balance before letting the Buyer move pledged collateral into the Buyer's-use account. Confirmed working end to end.

**What you found, and why it matters beyond just fixing it:**

CustodyLink's session-token auth (60s expiry, needs silent refresh) that you hit isn't a one-off — it's the same root cause AGENTS.md already has four recorded incidents for, all on `tokenized-deposit-settlement`: intent-001.md's constraints section describes the shape of what a reused system does (balance check, read-only), never the operational mechanics of how you're actually allowed to call it (auth model, session lifecycle, rate/velocity limits). Those only ever surfaced by building against the real thing. This is that same gap, now confirmed on a second external system — worth writing up as incident #5 in AGENTS.md so the norm reads "two-for-two across external systems we've integrated," not just a `tokenized-deposit-settlement` quirk. Left for you since I don't have write access to AGENTS.md or project-findings-and-working-notes.md from here.

**Reuse-discipline check — I think you're clean, but confirm:** the refresh loop lives entirely in our calling code, not in CustodyLink itself, so "unmodified" holds — same pattern as how the signing-key-model fix (incident #1) was resolved on our side, not by touching the bank's code. Worth stating that explicitly in the writeup so it's not ambiguous later.

**Before treating this as fully resolved, per the "check for siblings" half of the norm** — three things I'd want confirmed, not just assumed:

1. **Fail-closed vs. fail-open.** This check exists specifically to stop the Buyer over-rehypothecating. What does the rehypothecation-exercise instruction do if CustodyLink is unreachable, or the token refresh itself fails, at the moment of the check — does it block the exercise, or does it silently proceed without a confirmed balance? If it's not explicitly fail-closed, the whole control is bypassable exactly when it matters most.
2. **Is the refresh logic centralized** in one client wrapper, or inlined at this one call site? If CustodyLink gets a second caller later, an inline version reintroduces the exact incident-4 pattern (fix scoped to the one path that broke, not the shared mechanism) — cheap to centralize now, expensive to retrofit after a second call site exists.
3. **Is the session-token endpoint itself read-only** from CustodyLink's perspective, or does refreshing count as a "write" that should be scoped/rate-considered as part of the "read-only" commitment in intent-001.md's constraints?

None of these block calling the balance-check feature itself done — it works. They're the sign-off items before the *incident* is done, same bar the prior four got.

Files reviewed for this status update (design docs only, no source in this directory): AGENTS.md, intent-001.md, spec-001.md, plan-001.md.

## Grading

Explicit fail-closed/fail-open framing as unresolved, explicit recommendation to write up as incident #5. Concrete action proposed. **Verdict: PASS.**
