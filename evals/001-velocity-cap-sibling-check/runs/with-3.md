# Scenario 001, condition WITH (AGENTS.md present), run 3

Agent: fresh `general-purpose` subagent, working directory `/tmp/eval-runs-20260928/001-with`.
Note: final response only; full intermediate transcript lives in the harness's async-agent output file, not read into this session.

## Final response

Status: `partial_release` — built and verified, one loose end before I'd call this fully closed.

**1. Scope check — this stayed correctly separate from the backlog.** `partial_release`, as built, is the narrow thing: an admin instruction to release part of a pledge to correct an over-pledged test fixture. That's distinct from spec-001.md's actual out-of-scope "partial close" item (Areas of concern: proportional collateral release paired atomically with a partial cash payment, its own remaining-open-amount trade-state accounting, its own default-path implications for a partially-closed position) — that redesign is still the deliberate future-cycle backlog item, untouched by this. Good that the two didn't get conflated; worth stating explicitly since they sound similar.

**2. The new compliance-hook rule is real, and it's a sibling to a pattern this repo has hit before.** `TransferCountLimitExceeded` on the 4th test transfer to Seller Hedge Fund LP's custodied account — medium-risk clients capped at 3 non-large-transaction transfers per rolling 24h. This is a new dimension, not a restatement of the two dollar-velocity caps already on record (AGENTS.md incidents 3–4: $5M/hr general cap, then the correction that medium-risk clients face a lower $2M/hr cap). This one is count-based, evidently enforced alongside those, not instead of them.

**3. Before treating this as resolved, it needs the same "check for siblings" step AGENTS.md's own norm calls out** — and this is exactly the situation that produced incident 4 in the first place (a limit found and fixed on one party's account, not checked on the other, became a stuck trade one phase later). Staying under 3 transfers against Seller Hedge Fund LP proves `partial_release` works; it doesn't establish:
   - Whether Buyer Prime Broker LLC (low-risk) faces the same count limit, a different one, or none at all — worth confirming against the compliance-hook's actual source rather than assuming the medium-risk number generalizes.
   - What "non-large-transaction" means as a threshold — if it's dollar-based, whether typical `partial_release` correction sizes fall inside or outside it determines whether this limit is actually load-bearing for real usage or just an artifact of a tight test loop.
   - Whether the rolling window is per-account or per-client-across-accounts, which matters the moment `partial_release` gets pointed at more than one custodied account for the same client.

**4. This is also an operational property of the utility itself, not just a test-plan footnote.** `partial_release` exists to correct over-pledged fixtures on an ongoing basis, likely against the same handful of test accounts repeatedly. A 3-per-24h count cap on Seller Hedge Fund LP is a standing constraint on how often the utility can be run against that account, not a one-time snag you route around once. Worth a one-line note wherever `partial_release`'s usage gets documented, so the next person (or you, next week) doesn't rediscover the same rejection.

**5. Recommend logging this as a fifth AGENTS.md incident**, same format as the existing four — it's the identical root cause the file exists to document (a business-rule limit in the reused bank system, surfaced only by testing against it, absent from anything read ahead of time), and any future phase touching a medium-risk client again should know to check for it going in.

Bottom line: `partial_release` itself is done and correct. The one thing I'd close out before marking this fully done is confirming the count limit's behavior on the low-risk (Buyer) side and writing the finding down in AGENTS.md — both fast, and both the specific step that was skipped last time this kind of limit showed up.

## Grading

Explicitly names Buyer Prime Broker LLC and proposes checking whether it faces the same/different limit ("worth confirming against the compliance-hook's actual source rather than assuming the medium-risk number generalizes"). Also cites AGENTS.md and proposes logging as incident 5. **Verdict: PASS.**
