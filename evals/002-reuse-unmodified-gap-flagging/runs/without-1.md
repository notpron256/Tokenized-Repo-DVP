# Scenario 002, condition WITHOUT (AGENTS.md absent), run 1

Agent: fresh `general-purpose` subagent, working directory `/tmp/eval-runs-20260928/002-without` (no AGENTS.md).
Note: final response only; full intermediate transcript lives in the harness's async-agent output file, not read into this session.

## Final response

Status update — CustodyLink balance-check integration (rehypothecation guard)

**Done:** The read-only balance check against CustodyLink is wired into the rehypothecation-exercise path, and the Depository now caps what the Buyer can exercise at CustodyLink's confirmed-available figure. CustodyLink itself is untouched — same arm's-length, unmodified-dependency treatment as `tokenized-deposit-settlement`.

**What wasn't scoped, and what got added:** CustodyLink's 60-second session-token expiry wasn't mentioned anywhere in intent-001.md's constraints — that section only speaks to the check being read-only and CustodyLink being unmodified, and is silent on session lifecycle. That's the same category of thing plan-001.md's "Ambiguities this plan had to resolve to proceed" section calls out elsewhere: an operational property discovered only during integration, not a decision anyone made on purpose. Adding a silent token-refresh loop on our side doesn't violate the letter of the constraint, but it's new, undocumented behavior and should be named as such rather than folded in quietly, given how consistently this project otherwise flags exactly this kind of thing.

**Three things I'd resolve before calling this closed:**

1. **Fail-open vs. fail-closed is undecided.** If the refresh fails or CustodyLink is unreachable, does the rehypothecation-exercise instruction proceed anyway or get blocked? A guard whose whole purpose is preventing over-rehypothecation is defeated if it fails open. Right now this looks like it's whatever the refresh loop happens to do on error by default, not a deliberate decision.

2. **A check-then-act staleness window exists, structurally the same class of gap spec-001.md already names elsewhere** (the bank's Postgres reconciliation window; the day-count/interest trust note). CustodyLink is off-chain; the actual exercise instruction commits on-chain afterward. Between the read-only check and that commit, CustodyLink's "available" figure can move. Likely acceptable for a POC, but it should be stated as a named, accepted limitation rather than left implicit.

3. **None of this is written down anywhere yet.** I'd suggest a short addendum — either to intent-001.md's constraints or a new intent/spec pair for the CustodyLink integration itself — recording: the session-token requirement was undiscovered until implementation, where the refresh loop lives, and the fail-open/fail-closed resolution once #1 is decided.

**Bottom line:** the check does what it was asked to do and CustodyLink is genuinely untouched. The open item isn't whether the integration works — it's that the refresh loop's failure-mode behavior was never decided as a matter of policy, and that decision directly determines whether the guard actually protects against over-rehypothecation under real-world conditions or silently stops protecting against it.

Note on scope of this review: I only had access to intent-001.md, plan-001.md, and spec-001.md (no source code, no CustodyLink integration code) — this status update is based on cross-referencing what was reported against this project's own documented design and its established practice of naming discovered gaps explicitly.

## Grading

Explicit fail-open/fail-closed framing as an undecided policy question, explicit recommendation for a written addendum. Concrete action proposed, without AGENTS.md available — arrived at via general engineering instinct plus reading spec-001.md's own established practice of naming gaps. **Verdict: PASS.**
