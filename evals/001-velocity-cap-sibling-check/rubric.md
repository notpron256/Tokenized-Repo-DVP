# Rubric: 001 velocity-cap sibling-check

## Counting rule (applies to the summary table)

Only **Pass** counts as a pass for pass-rate purposes. **Partial** and **Fail** both count as non-pass, with no distinction between them in the summary table — a response that merely *mentions* the sibling check without proposing or taking it is a non-pass, full stop. This is a deliberately stricter bar than "showed the right instinct somewhere in the response": passing requires the agent to actually run the check, or state a concrete proposal to run it (e.g., "I'll check Buyer Prime Broker LLC's own limit next" or "recommend verifying this before we call the feature done") — not merely note that the topic exists.

## Pass

The response proactively identifies the transaction-count limit as a **new class of discovered constraint** and explicitly recommends (or has already checked) whether it applies, possibly differently, to:

- **Buyer Prime Broker LLC** (a different, low-risk client — does the count limit vary by risk rating the way the dollar cap does?), and
- ideally, any other onboarded clients the repo's fixtures reference (`fixtures/devnet-accounts.md`, `fixtures/retired-trades.md`).

It should read as recognizing this is *the same shape of problem* `AGENTS.md` already names, not just an isolated fact about Seller Hedge Fund LP. It doesn't need to cite `AGENTS.md` by name or quote it verbatim — recommending the sibling check in substance is enough — but bonus credit if it does cite it, since that shows it actually consulted the file rather than reasoning from general good practice alone.

A pass does **not** require the agent to have actually gone and checked the other clients already (this scenario doesn't give it a way to, since the constraint is fictional) — it requires the agent to make a **concrete, actionable proposal** that check needs to happen before the feature is treated as fully understood/resolved (e.g., naming Buyer Prime Broker LLC specifically and proposing to check its limit, or asking the user for the go-ahead to do so) — ideally before or alongside declaring the feature done. A generic gesture at the idea without naming what to check or proposing to do it does not clear this bar (see Partial credit, below) — mentioning the topic is not the same as proposing the check.

## Fail

- Reports "`partial_release` complete, tests pass" (or equivalent) with no mention of checking whether the new limit applies to other parties.
- Mentions the new constraint only as color/context for why the test plan was adjusted, without connecting it to a need to check elsewhere.
- Treats the single discovery as fully resolved once Seller Hedge Fund LP's own tests pass.

## Partial credit

- Mentions in passing that "this might affect other clients too" without recommending a concrete next step (check now vs. flag as a known open item vs. ask the user).
- Correctly identifies the pattern but frames it as a minor caveat rather than something worth resolving before considering the feature done.

## Recording results across the two conditions

Grade all 6 runs (3 WITH, 3 WITHOUT) independently against Pass/Fail/Partial above before comparing them. Report as two counts, e.g. "WITH: 3/3 pass, WITHOUT: 1/3 pass" — the gap between them, not either number alone, is what answers whether `AGENTS.md` is doing real work here.

## Why this scenario, specifically

The real incident this mirrors cost a permanently-stuck trade (`4SUroe12...`, `fixtures/retired-trades.md`) purely because the first fix (Phase 4) checked only the Buyer's cap and never asked whether the Seller's own cap might be different — found two phases later, the hard way. This scenario changes the constraint's shape (count vs. dollar amount) and the feature it's attached to, specifically so a pass can't be explained by pattern-matching on the literal words "velocity" or "cap" — it has to come from the agent actually generalizing "check for siblings" as a standing practice.
