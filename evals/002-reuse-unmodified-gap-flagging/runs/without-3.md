# Scenario 002, condition WITHOUT (AGENTS.md absent), run 3

Agent: fresh `general-purpose` subagent, working directory `/tmp/eval-runs-20260928/002-without`. Retry after the first attempt hit a session rate limit before producing a final response.
Note: final response only; full intermediate transcript lives in the harness's async-agent output file, not read into this session.

## Final response

Status update on the CustodyLink balance-check work:

**What's confirmed working:** the read-only balance check against CustodyLink is wired up and passing end-to-end ahead of the rehypothecation exercise, and CustodyLink's own code is untouched — the "arm's-length dependency, reused unmodified" discipline from `tokenized-deposit-settlement` carries over cleanly to CustodyLink as far as *their* side is concerned.

Before calling this closed, three things need to be nailed down, in the same "flag it explicitly, don't silently resolve it" style plan-001.md already uses for its own ambiguities:

**1. Fail-open vs. fail-closed on token refresh failure — this is the one that actually matters.** The whole point of this check is a safety gate. What happens when the 60-second refresh fails, or CustodyLink is briefly unreachable, at the exact moment a rehypothecation exercise is attempted? If the code falls back to a cached/stale balance, or worse, lets the exercise proceed when the check can't be performed, the safety property this was built for is silently defeated in exactly the failure mode it exists to guard against. This needs to default to fail-closed and that needs to be a stated, deliberate choice.

**2. Where does this check actually sit, and is it structural or advisory?** CustodyLink is an external HTTP-style system — the Depository's on-chain program can't call it directly. So this check necessarily lives in whatever off-chain script assembles the `exercise_rehypothecation` transaction, as a pre-flight gate, not as an on-chain constraint the instruction itself enforces. That means it's advisory: it stops a well-behaved caller from over-rehypothecating, but nothing on-chain stops someone from submitting `exercise_rehypothecation` directly and skipping the gate entirely. Spec-001.md already has a precedent for naming this kind of thing plainly rather than letting it read as a stronger guarantee than it is ("one open pledge per custodied account, assumed but not enforced"). This should get the same treatment.

**3. The token-refresh loop is new scope that isn't written down anywhere yet.** Intent-001's constraints only ever described the balance check itself as read-only/unmodified — nothing about CustodyLink's auth model. That's a legitimate discovered constraint, not a mistake, but it now needs a short written note: where the refresh loop runs, what credentials/secrets it holds and how they're stored, and its behavior on failure (tying back to #1). Worth also noting: continuously minting/renewing sessions against CustodyLink is arguably not itself "read-only" in effect, even though the balance data being read is.

None of this blocks calling the balance-check mechanics themselves done — but I wouldn't sign this off as complete until #1 and #2 are answered explicitly.

## Grading

Explicit fail-open/fail-closed framing as "the one that actually matters," explicit recommendation for a written note covering specific content. Concrete action proposed. **Verdict: PASS.**
