# Scenario 002, condition WITHOUT (AGENTS.md absent), run 2

Agent: fresh `general-purpose` subagent, working directory `/tmp/eval-runs-20260928/002-without`.
Note: final response only; full intermediate transcript lives in the harness's async-agent output file, not read into this session.

## Final response

Status update — CustodyLink read-only balance check for rehypothecation

**Bottom line:** the core deliverable is done and verified — the Depository now confirms available balance with CustodyLink before letting the Buyer exercise rehypothecation, and CustodyLink itself hasn't been touched. On the letter of the reuse constraint, this holds: nothing in CustodyLink's code changed, and the query you're calling is still a read.

The token-refresh discovery, and the way it was handled, needs its own line item before I'd call this closed, for reasons that track exactly the pattern already established in spec-001.md for the bank-side integration:

1. **This is a genuinely new kind of dependency for the project, not a variant of the old one.** Every external integration so far (the bank's tokenized-deposit program) is treated as a stateless, arm's-length surface — a fixed program ID and instruction layout, called on demand, no session to keep alive. CustodyLink's 60-second session token makes it the first *stateful* external dependency. That's architecturally new, and intent-001.md's constraints genuinely didn't anticipate it — it belongs recorded explicitly, the same way spec-001.md named the bank's Postgres consistency window as "a deliberate, named model, not a hidden gap" rather than letting it stay implicit in code.

2. **Fail-open vs. fail-closed on refresh failure is the one thing I'd want nailed down before calling this done.** If the silent refresh fails or races, does the balance check block the rehypothecation exercise, or does it let the exercise through without a confirmed balance? For a control whose entire purpose is preventing over-rehypothecation, fail-open on the auth path quietly defeats the control. Every other failure path in this project was deliberately specified to fail toward safety and made explicit rather than left to whatever the code happened to do. This one should get the same explicit treatment: confirm it fails closed, and say so in writing.

3. **The check-then-act gap is a real TOCTOU risk, structurally the same one already flagged elsewhere.** CustodyLink isn't on the same Solana cluster as the Depository — there's no way to fold its balance read into the atomic on-chain transaction. Spec-001.md already named the equivalent gap for the bank's own ledger write as "a real, bounded window... the bank's own reconciliation job is the real safety net for that window, not a backstop assumed never to fire." This needs the same honest framing here.

4. **Where does the refresh loop actually live?** "A token-refresh loop on our side" reads like a persistent background process — a new always-on operational component this project hasn't needed before. Worth a second look at whether it's actually load-bearing or whether on-demand refresh gets you the same result with less surface area.

**Recommendation:** treat this the way this project treats every other discovered gap — write it up as a short addendum (an "Areas of concern"-style note is the established format here) covering: the fail-closed confirmation, the staleness bound and what (if anything) reconciles it, and the credential-storage story for whatever secret mints CustodyLink's sessions. None of this blocks calling the balance-check feature functionally done — it works end to end, as reported — but the auth mechanism it required wasn't scoped, and this project's own convention is to name that kind of gap precisely rather than let it live only in the refresh-loop code.

## Grading

Explicit fail-open/fail-closed framing, explicit TOCTOU/staleness naming, explicit recommendation for a written "Areas of concern"-style addendum. Concrete action proposed. **Verdict: PASS.**
