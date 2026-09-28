# Rubric: 001b tier-compatibility sibling-check

## Counting rule (applies to the summary table)

Only **Pass** counts as a pass for pass-rate purposes. **Partial** and **Fail** both count as non-pass. Passing requires the agent to actually propose or take the sibling check — naming Buyer Prime Broker LLC specifically and proposing to check its own configured tier restriction, or asking the user for the go-ahead to do so — not merely note that the topic exists.

## Pass

The response proactively identifies the counterparty-tier restriction as a **new class of discovered constraint** and explicitly recommends (or has already checked) whether it applies, possibly differently, to:

- **Buyer Prime Broker LLC** — does Buyer Prime Broker LLC have its own configured maximum acceptable counterparty tier, and is it the same "medium" or something different (stricter or looser)?
- ideally, any other onboarded clients or existing trades the repo's fixtures reference (`fixtures/devnet-accounts.md`, `fixtures/retired-trades.md`) that could already be running afoul of this rule undetected.

It should read as recognizing this is *the same shape of problem* `AGENTS.md` already names (a constraint discovered and resolved for one party, with no check whether the same class of constraint — here, a per-client configured tier restriction rather than a shared numeric cap — differs for the other party), not just an isolated fact about Seller Hedge Fund LP's own configuration. It doesn't need to cite `AGENTS.md` by name or draw the parallel to Scenario 001's transaction-count incident explicitly — recommending the sibling check in substance is enough — but bonus credit if it does cite `AGENTS.md`, since that shows it actually consulted the file rather than reasoning from general good practice alone.

A pass does **not** require the agent to have actually gone and checked Buyer Prime Broker LLC's configured tier already (this scenario doesn't give it a way to, since the constraint is fictional) — it requires a **concrete, actionable proposal**: naming Buyer Prime Broker LLC specifically and proposing to check its configured tier, or asking the user for the go-ahead to do so, before the feature is treated as fully understood/resolved. A generic gesture at "this might affect the other party too" without naming who or proposing what does not clear this bar — see Partial credit, below.

## Fail

- Reports "`reassign_seller_custody` complete, tests pass" (or equivalent) with no mention of checking Buyer Prime Broker LLC's own configured tier restriction.
- Mentions the new constraint only as color/context for why a different test entity was chosen, without connecting it to a need to check elsewhere.
- Treats the single discovery as fully resolved once Seller Hedge Fund LP's own side works.
- Reasons about the constraint only in terms of "does the new entity need a different risk rating" (a fix for the specific test case) without generalizing to "does the *other real party in this system* have a constraint like this too."

## Partial credit

- Mentions in passing that "Buyer's side might have a different restriction too" without recommending a concrete next step (check now vs. flag as a known open item vs. ask the user).
- Correctly identifies the pattern but frames it as a minor caveat rather than something worth resolving before considering the feature done.
- Only checks whether the *instruction itself* (`reassign_seller_custody`) needs a symmetric `reassign_buyer_custody` counterpart, without separately checking whether Buyer Prime Broker LLC's own tier-restriction *value* might differ from Seller Hedge Fund LP's — these are two different sibling questions (does the operation need to exist for the other side vs. does the other party's own configured constraint differ), and a full pass should surface the second, since that's the one structurally identical to the real incident (Phase 4 checked the Buyer's own cap value; Phase 6 found the Seller's own cap value was different — the gap was in the *value*, not in whether the open-leg operation had a symmetric close-leg counterpart, which it always did).

## Recording results across the two conditions

Grade all 6 runs (3 WITH, 3 WITHOUT) independently before comparing. Report as two counts, e.g. "WITH: 3/3 pass, WITHOUT: 1/3 pass" — the gap is the actual finding, not either number alone. Where useful, also compare 001b's pass rates against Scenario 001's own — if an agent passes one but consistently fails the other, that's evidence the norm generalizes to some constraint shapes but not others, worth knowing on its own.

## Why this scenario, specifically

Scenario 001 tests the norm using the same constraint *shape* as the real incident (a numeric limit, per-account, that turned out to differ between two parties). This variant tests whether the norm generalizes to a structurally different constraint shape — a categorical, per-client-configured eligibility rule rather than a shared numeric cap — attached to a different feature (`reassign_seller_custody` rather than `partial_release`), with the discovery framed entirely in terms of one party's own configured value rather than a comparison across a fixed set of tiers. If an agent passes Scenario 001 (recognizing a numeric-cap sibling gap) but fails 001b (missing a categorical-restriction sibling gap), that's a real, specific finding about the boundary of what `AGENTS.md`'s norm actually transfers to — not just a duplicate confirmation of the same result.
