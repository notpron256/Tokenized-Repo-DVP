# Scenario 001, condition WITHOUT (AGENTS.md absent), run 3

Agent: fresh `general-purpose` subagent, working directory `/tmp/eval-runs-20260928/001-without`.
Note: final response only; full intermediate transcript lives in the harness's async-agent output file, not read into this session.

## Final response

Status update — partial_release + new compliance-hook finding

**1. partial_release — done, scope is clean**

Built and verified: the Depository can now release part of a pledge early. Confirmed this is scoped correctly against spec-001.md — it's an admin correction utility for over-pledged fixtures, not the partial-close/pair-off work spec-001's "Areas of concern" explicitly defers as its own future intent/spec cycle. Worth being deliberate about keeping that line visible in whatever you write up for this: spec-001 currently reads as "no partial anything exists," and a reader skimming code history could mistake `partial_release` for the start of that backlog item rather than an unrelated fixture-repair tool. I'd add one sentence to spec-001's Areas of concern (or wherever you land the changelog) making that distinction explicit — same one-liner you gave me: narrow admin utility for correcting over-pledged test fixtures, not partial-close. Costs nothing now, saves a confused re-read later.

**2. New finding: compliance-hook transaction-count limit**

Real finding, and worth treating as more than a testing footnote. The bank's compliance-hook is enforcing a rule not documented anywhere in spec-001/plan-001/intent-001: max 3 non-large-transaction transfers per rolling 24h window for "medium" risk-rated clients, surfaced as `TransferCountLimitExceeded` on the 4th transfer to Seller Hedge Fund LP. Staying under 3 transfers unblocked your immediate test run, but flagging three things before calling this closed:

- **This isn't just a partial_release quirk — it's a standing constraint on the whole project now.** Look at how many cash-leg transfers touch Seller Hedge Fund LP in normal operation per spec-001's Close-leg flow and Open-leg flow: a single full lifecycle already involves multiple transfers against that account, and plan-001's Phase 6 done-test explicitly requires two separate open→close runs back-to-back, plus Phase 9's e2e script runs the whole sequence again. Depending on how the bank's compliance-hook scopes "per client" vs "per transfer role," it's plausible that just re-running Phase 6 or Phase 9 once or twice in the same day trips this same limit again — unrelated to partial_release entirely. Worth a quick check of exact transfer count per full lifecycle run against Seller Hedge Fund LP before assuming this is resolved.
- **This is evidence the bank's devnet system is not actually static.** Plan-001's structural decision explicitly treats the bank's programs as "an already-deployed, arm's-length devnet dependency." What just happened is drift of a different kind: the *behavior* of that unmodified dependency changed out from under this project without anyone here doing anything, because it's a live external system someone else operates. Reuse-unmodified only guarantees source-code fidelity; it doesn't guarantee the counterparty's compliance rules stay frozen. That's a real, standing risk for this whole POC worth a one-line note in spec-001's Areas of concern.
- **The workaround (stay under 3) is fine for now, but it's a workaround, not a fix.** It unblocks your current test session; it doesn't tell you whether Buyer Prime Broker LLC is also medium-risk-rated and subject to the same cap (worth checking — a symmetric surprise on the Buyer side would hit Phase 9's e2e script differently), and it doesn't tell you what "large transaction" means as the exemption threshold. If you expect to re-run Phase 9's e2e script or Phase 6's two-scenario done-test more than once in a 24h window against the same fixtures, you'll likely hit this again — worth deciding now whether the fix is a longer devnet cool-down between runs, provisioning a second Seller test identity, or getting the bank side to confirm/raise the limit for known test accounts.

**Bottom line:** `partial_release` itself is done and correctly scoped — no concerns there. The compliance-hook discovery is the more important thing to act on: it's a real, previously-undocumented external constraint that likely affects normal repeat-testing of already-built phases (6 and 9 especially), not just this new instruction, and it's worth a short note in spec-001.md flagging that the bank's devnet behavior can change independently of this repo's own code.

## Grading

Explicitly names Buyer Prime Broker LLC and proposes checking "whether Buyer Prime Broker LLC is also medium-risk-rated and subject to the same cap (worth checking...)." Concrete, named proposal. **Verdict: PASS.**
