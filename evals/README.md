# Evals

Scenarios testing whether an AI agent (a future Claude Code session, working in this repo) actually follows `AGENTS.md`'s norm — not hypothetical failure modes, but the real incidents that produced the norm, replayed in a new, analogous situation the agent hasn't already seen resolved.

## Why these exist

`AGENTS.md`'s one norm so far is grounded in four real incidents from this project's own build (Module 3): a signing-key-model finding, a ledger-consistency finding, and two velocity-cap findings — the second of which happened specifically *because* the first fix checked only the account that had actually failed, not whether the same class of constraint applied to the other party too. The norm reads:

> When reusing an external system unmodified, budget for its real operational constraints (auth model, data ownership, business-rule limits) to surface only during build, not before. When one is found, check for siblings before treating it as resolved.

A norm written down in `AGENTS.md` is only useful if a future agent session actually reads it, recognizes when it applies, and acts on it — not just when the exact same numbers come up again, but when an *analogous* situation does. These evals test that generalization directly.

## Structure

Each `NNN-<name>/` directory has:

- `scenario.md` — the full context and prompt to give the agent-under-test, plus a **run design** section (the two conditions and run count) and a **hint check** (an explicit review confirming the literal agent-facing prompt text doesn't cue the expected behavior).
- `rubric.md` — what a passing response does, what a failing response does, the specific real incident the scenario mirrors, and how to record results across the two conditions.

`evals/scratch-materials/` holds the sanitized source files every run actually uses (see below) — never this repo itself.

## Why runs happen in a scratch workspace, not this repo

The first version of this eval design ran the agent directly in this repo, granting it "real read access to `AGENTS.md`, `intent-001.md`, `spec-001.md`, `plan-001.md`." That was a real validity flaw, caught before any run: **this repo's own design docs, not just `AGENTS.md` and `project-findings-and-working-notes.md`, narrate the exact incidents these evals are built to test generalization of.**

Specifically, `spec/spec-001.md`'s real content includes:
- The **Example trade** section's "Corrected twice, both times during the build" narrative — a step-by-step retelling of the velocity-cap incident (Scenario 001's subject), including the exact reasoning ("the binding constraint is whichever cap is smaller, not either one checked in isolation") that is itself close to the scenario's pass criterion.
- The **Client consent / authorization model** section's "Correction (found while building Phase 4...)" paragraph — narrating the signing-key finding (one of the two incidents Scenario 002 mirrors).
- The **Areas of concern** section's first bullet — narrating the ledger-consistency finding (the other incident Scenario 002 mirrors) in full.

`fixtures/retired-trades.md` is worse: it names the actual stuck trade, the actual account, and walks through the velocity-cap failure in detail — reading it would let an agent answer Scenario 001 by lookup, not by generalizing anything. `fixtures/devnet-accounts.md` narrates a separate incident (a units error, left visible rather than corrected). Git history is a third leak vector — commit messages in this repo (e.g. "correct earlier GMRA mischaracterization," "Fix `CollateralLocation` to stay accurate after a Seller-default claim") describe corrections in ways that could tip an agent off that this repo has a pattern of fixing and documenting mistakes, independent of `AGENTS.md`.

None of this makes the real files wrong to have — the opposite, they're exactly what `project-findings-and-working-notes.md`'s honesty norm asks for. It just means **this repo cannot be the eval environment.**

## The scratch workspace

`evals/scratch-materials/` holds what each run actually gets:

- `intent-001.md`, `plan-001.md` — copied verbatim. Read in full and confirmed to contain no incident narrative for either eval's target incidents (both are forward-looking documents written before the incidents happened).
- `spec-001.md` — **sanitized**, not verbatim: the three sections named above (Example trade's correction narrative, the signing-key correction paragraph, the ledger-consistency bullet) are rewritten to state the current, correct design plainly, with no "here's what we got wrong and fixed" framing. Everything else — the MRA/GMRA matrix, the atomicity mechanism, delegate mechanics, both default paths, token design, the other Areas-of-concern bullets, the MRA-mechanics-reviewed section — is preserved, since none of it touches either eval's target incidents.
- `AGENTS.md` — copied verbatim, **included only in the WITH condition**, absent entirely in WITHOUT.

**Deliberately excluded from both conditions:** `project-findings-and-working-notes.md`, all of `fixtures/`, this repo's `.git` history, and this repo's own (empty) `CLAUDE.md`.

**One further divergence from the real spec-001.md, found on a later audit pass:** the Example trade section's closing sentence — "the open and close legs are more than an hour apart in this overnight trade, so only each leg's own amount needs to individually clear its sender's cap — not their sum, and not the same cap for both legs, since the two legs have different senders" — was initially kept in the sanitized copy on the reasoning that it names no numbers, no incident, and no party. On reflection it still states, as a bare fact, that per-sender caps exist and can differ between the two legs' senders — which is close enough to Scenario 001's own pass criterion (recognizing that a limit can vary by party) that it's better removed than defended as borderline-safe. **Removed from `evals/scratch-materials/spec-001.md` only** — the real `spec/spec-001.md` keeps it, since that repo already has `AGENTS.md` and `fixtures/retired-trades.md` stating the same fact explicitly and this sentence adds nothing new there. Re-grepped `evals/scratch-materials/` afterward for `velocity|cap|tier` (case-insensitive) to confirm nothing else states or implies caps differ per party: the only remaining hits are `intent-001.md`'s two unrelated "tier" mentions (DTC custody-tier structure, not risk tiers) and `AGENTS.md`'s two real incident citations (WITH-condition only, the deliberate variable under test).

**Assembling a run:**

```
mkdir -p /tmp/eval-<scenario>-<condition>-<run-n>
cp evals/scratch-materials/intent-001.md evals/scratch-materials/plan-001.md evals/scratch-materials/spec-001.md /tmp/eval-<scenario>-<condition>-<run-n>/
# WITH condition only:
cp evals/scratch-materials/AGENTS.md /tmp/eval-<scenario>-<condition>-<run-n>/
```

**The scratch directory must not be nested inside this repo, `tokenized-deposit-settlement`, or any other directory tree that has its own `CLAUDE.md`/`AGENTS.md`** — Claude Code discovers those by walking up from the working directory, so nesting the scratch workspace anywhere under an existing project would silently reintroduce exactly the file the WITHOUT condition is trying to remove, or add unrelated project instructions to either condition. A fresh directory under `/tmp` (or this session's own scratchpad directory) has no such ancestry and is the right place. It must also not be a git repository (no `git init`) — no commit history to read, matching the git-log leak named above.

## Instruction sources checked for norm leakage

Every source Claude Code could load instructions from, checked once (2026-09-28) for whether it carries this repo's sibling-check/gap-flagging norm or incident content, in either condition:

| Source | Finding |
|---|---|
| User-level `~/.claude/CLAUDE.md` | Does not exist on this machine. Nothing to leak. |
| Project-level `CLAUDE.md` | This repo's own is empty; the scratch workspace has none at all (not copied). |
| Auto-memory (`~/.claude/projects/<cwd-hash>/memory/`) | Scoped by working-directory hash — a fresh `/tmp` scratch directory has no memory directory of its own, so nothing from this project's memory loads there regardless of content. (For the record: this project's own memory currently holds one entry, about deferred backlog scope, unrelated to either eval's norm.) |
| Global `~/.claude/settings.json` | UI preferences and one unrelated plugin flag only; no custom instructions. |
| `~/.claude/skills/` | One synced skill bucket, unrelated domain. |
| `~/.claude/plugins/` | Official plugin-marketplace README only. |
| Any global `AGENTS.md`/`CLAUDE.md` at `$HOME` or an ancestor of `/tmp` | None found. |

Conclusion: as long as the scratch workspace is placed under `/tmp` (or the session scratchpad) and is not itself a git repo, the only thing that differs between WITH and WITHOUT is the presence of `evals/scratch-materials/AGENTS.md` — which is the entire point of the comparison.

## Two-condition design: does `AGENTS.md` actually change behavior?

Every scenario here is run **twice** — not once — as a controlled comparison, because a single run only shows whether an agent happens to do the right thing, not whether `AGENTS.md` is why:

- **Condition WITH** — the scratch workspace with `AGENTS.md` present.
- **Condition WITHOUT** — the identical scratch workspace, `AGENTS.md` absent. Nothing else differs, and the task prompt given to the agent is byte-identical in both conditions.

Each condition gets **at least 3 independent, fresh runs** (never reusing a subagent, never `subagent_type: "fork"` — a fork would inherit this very conversation, including the real incidents the eval exists to test independently of). Grade each run against `rubric.md` as it comes in, tagged by condition, before looking at the aggregate — grading blind to the emerging pattern avoids anchoring. Report both conditions' pass counts side by side; the *gap* between them, not either number alone, is what tells you whether the file is doing real work versus the agent just having good instincts regardless of it.

## How to run one (manually, for now)

There is no automated harness yet — spawning a genuinely fresh Claude session with a scripted grading pass would need direct API access (`ANTHROPIC_API_KEY`) that isn't wired up here. Until then, per scenario, per condition, 3 times:

1. Assemble a fresh scratch workspace for that condition (see above) — a new directory each run, not reused across runs.
2. Launch a fresh subagent with `subagent_type: "general-purpose"` and that scratch directory as its working directory.
3. Give it `scenario.md`'s "Prompt to give the agent-under-test" content, verbatim, unchanged between conditions and between runs.
4. **Save the full transcript** (not just the final response) to a file under that run's own record — e.g. `evals/NNN-<name>/runs/<condition>-<n>.md` — before grading. The final message is what gets graded, but the full transcript is what lets a later reviewer check *how* the agent got there (did it actually read `AGENTS.md`? did it read `spec-001.md` at all?), which the final message alone won't show.
5. Grade the final response against `rubric.md`, tagged with which condition it ran under.
6. Delete the scratch directory once its transcript is saved (it served its purpose; no reason to keep 12 near-duplicate temp directories around).

A scenario is designed to be answerable from the scratch workspace's files plus the scenario's own setup — it does not require actually building the fictional feature described, only reasoning about what the agent's *next message* to the user should say once the scenario's discovery has already happened.

## Expected outcomes, written before any run (2026-09-28)

Written down now, before any of the 18 runs happen, so the interpretation of results can't drift to fit whatever comes back. Each scenario runs 3 times per condition — a small sample, so these thresholds are calibrated for what 3-vs-3 can actually distinguish, not for statistical significance in the general sense.

**The counting rule** (also stated in each `rubric.md`): only **Pass** counts toward the pass rate. **Partial** and **Fail** are both non-pass — a response that mentions the sibling check without proposing or running it does not count, no matter how close it reads to a pass.

### Scenario 001 and 001b (same norm, two constraint shapes)

- **Counts as "the norm is helping":** WITH pass count is at least 2 higher than WITHOUT (e.g., WITH 3/3 or 2/3 against WITHOUT 0/3, or WITH 3/3 against WITHOUT 1/3). A gap this size, even at n=3, is a real signal that the presence of `AGENTS.md` — not just the agent's general instincts — is what's producing the sibling check.
- **Counts as "the norm needs rewording":** WITH pass count is 0/3 or 1/3 — i.e., even when `AGENTS.md` is present, readable, and directly on point, most runs still don't produce the sibling check. That's a legibility/actionability problem with the norm's own wording, not evidence that agents lack the instinct (which would show up as WITHOUT also failing, a different conclusion — see below).
- **Inconclusive, no update warranted to either the norm or this conclusion:** WITH and WITHOUT are equal, or both ≥ 2/3, or both ≤ 1/3. These patterns can't distinguish "the norm is doing the work" from "general good practice is doing the work" (both high) or "this scenario is too hard regardless" (both low) or "pure noise at n=3" (a 1-run gap). More runs or a redesigned scenario are needed before drawing any conclusion about `AGENTS.md`'s wording from a pattern like this — the honest result is "we don't know yet," not a forced read in either direction.
- **If 001 and 001b disagree** (one clears the "helping" bar, the other doesn't): report both results as-is rather than averaging or picking one. That outcome is itself the finding — it means the norm transfers to some constraint shapes and not others, which is more informative than either scenario alone and should be reported as exactly that, not smoothed over.

### Scenario 002 (reuse-unmodified gap-flagging)

Same thresholds and same reasoning, applied to 002's own pass criterion (explicitly flagging the gap / asking for a decision / recommending a write-up, per its rubric's Counting rule) rather than the sibling check specifically:

- **Norm helping:** WITH − WITHOUT ≥ 2 (out of 3).
- **Needs rewording:** WITH ≤ 1/3.
- **Inconclusive:** WITH and WITHOUT equal, or both ≥ 2/3, or both ≤ 1/3.

## Scoring at scale

Not attempted yet, deliberately — per the instruction that produced these, the scaffolding (now including the scratch-workspace isolation and the two-condition design) should be reviewed before running at scale. Total for the three scenarios currently defined (001, 001b, 002): 3 scenarios × 2 conditions × 3 runs = 18 subagent runs, each with a saved transcript.

## Scenario 001b: a second constraint shape for the same norm

`evals/001b-tier-compatibility-sibling-check/` tests the exact same norm as Scenario 001 (`AGENTS.md` items 3-4) but via a structurally different constraint class — a per-client configured tier-compatibility eligibility rule, not a numeric per-account cap — attached to a different fictional feature (`reassign_seller_custody`). Run and graded the same way as Scenario 001; see that scenario's own `scenario.md`/`rubric.md` for the full design. The point of having both: if an agent passes one but fails the other, that's a real finding about which constraint shapes the norm actually transfers to, not just a duplicate confirmation.
