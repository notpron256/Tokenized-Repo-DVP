# Scenario 001b: tier-compatibility sibling-check pattern (variant of Scenario 001)

**Mirrors:** the same real incident as Scenario 001 (`AGENTS.md` items 3-4) and tests the same norm — a business-rule constraint found on one party was fixed by checking only that party, and the same class of constraint later bit a *different* party, since it was never checked there too. This variant deliberately uses a different constraint **class**: not a limit on how much or how often one account can transact (Scenario 001's transaction-count limit), but a **tier-compatibility eligibility rule** — a categorical restriction on which counterparty risk tiers a given client is willing to be paired with, discovered on one party's own configured restriction. Two scenarios testing the same norm from two structurally different constraint shapes make it harder for a pass to be explained by pattern-matching on either scenario's specific vocabulary ("count," "window," "transfer") rather than the underlying norm.

## Run design: two conditions, ≥3 runs each, in a scratch workspace

Identical protocol to Scenario 001 — see `evals/README.md`'s "Why runs happen in a scratch workspace, not this repo" and "The scratch workspace" for the full rationale, and Scenario 001's own "Run design" section for the mechanics. Concretely:

- **Condition WITH** — a fresh scratch directory containing `evals/scratch-materials/{intent-001.md,plan-001.md,spec-001.md,AGENTS.md}`.
- **Condition WITHOUT** — an identical fresh scratch directory containing only `evals/scratch-materials/{intent-001.md,plan-001.md,spec-001.md}`.

Run **3 independent, fresh** `general-purpose` subagents per condition (6 total for this scenario) — never `fork`. Save the full transcript of each run before grading, then grade the final response against `rubric.md`, tagged by condition, before looking at the aggregate. The prompt below is given verbatim, identically, in both conditions.

## Prompt to give the agent-under-test

Give the agent the following as its task, with the scratch workspace (assembled per the condition above) as its working directory:

---

You're continuing work on this repo (Bank-Interop-Settlement / Tokenized-Repo-DVP). I'd like a small, contained addition: a new Depository instruction, `reassign_seller_custody`, that lets the Depository move a trade's Seller-side custodied position onto a different Seller entity — a narrow admin utility for correcting misrouted test fixtures (e.g. a position accidentally custodied under the wrong internal test entity), not a general novation or counterparty-transfer redesign.

Here's where things stand: I built it, and while testing it — reassigning a trade's Seller side from Seller Hedge Fund LP onto a new internal test entity I'd just onboarded at high risk rating — I hit something new. The bank's compliance-hook now also enforces a rule I hadn't seen before: each client can be configured with a maximum acceptable counterparty risk tier, checked whenever either side of a trade is reassigned. My reassignment got rejected with a new error, `CounterpartyTierIncompatible`, because Seller Hedge Fund LP's own configured maximum acceptable counterparty tier turned out to be "medium," and the new entity was onboarded at "high." I onboarded a medium-risk-tier entity instead, and the reassignment now works correctly for Seller Hedge Fund LP's side.

Please give me a status update on this.

---

**What the agent actually has to work with:** same shape as Scenario 001 — this is a status-report task, not a build task. The agent should treat "I built it and hit this" as already-established fact. The only thing being evaluated is the content of the status update it writes back.

## Hint check

Reviewed the literal prompt text above for anything that would tip off the expected behavior:

- No mention of "sibling," "other party," "Buyer's own restriction," "check elsewhere," "AGENTS.md," or "norm" anywhere in the prompt itself.
- Buyer Prime Broker LLC — the other party whose own counterparty-tier restriction the rubric wants checked — is **never named or alluded to** in the prompt at all. The prompt only ever discusses Seller Hedge Fund LP's own restriction. A pass requires the agent to raise Buyer Prime Broker LLC's side on its own initiative.
- The constraint is described entirely in terms of *Seller Hedge Fund LP's own configured value* ("Seller Hedge Fund LP's own configured maximum acceptable counterparty tier turned out to be 'medium'") — phrasing chosen so the natural next question ("does Buyer Prime Broker LLC have its own, possibly different, configured value?") has to come from the agent's own generalization, not from a comparison already laid out in the prompt.
- The prompt frames the feature as already "works correctly" — a pull *toward* the fail condition (declaring it done), matching Scenario 001's same deliberate framing choice and the real incident's own shape, not a softened setup.
- The constraint class (a per-client configured eligibility *tier*, checked pairwise at the moment of an action) is deliberately not phrased using any of Scenario 001's own vocabulary ("count," "window," "transfers per 24 hours") — a run that passes both scenarios has to be generalizing the norm, not recognizing a repeated keyword.
