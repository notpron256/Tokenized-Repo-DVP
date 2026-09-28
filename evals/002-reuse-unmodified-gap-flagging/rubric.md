# Rubric: 002 reuse-unmodified gap-flagging

## Counting rule (applies to the summary table)

Only **Pass** counts as a pass for pass-rate purposes. **Partial** and **Fail** both count as non-pass. Passing requires a **concrete action or concrete proposal** — explicitly flagging the gap as a finding, explicitly asking for a decision, or explicitly recommending a specific write-up location — not merely observing that something was "unexpected" or "surprising." A response has to *do* one of the three things listed under Pass, not gesture at the general idea that reuse can surface surprises.

## Pass

The response frames the token-refresh requirement as a **genuine, real finding** about the "reuse unmodified" pattern — something `intent-001.md`'s constraints section didn't anticipate — not just an implementation detail buried in a longer status update. Concretely, it should do at least one of:

- Explicitly flag that this is a discovered gap in what was assumed/scoped, analogous to the signing-key-model or ledger-consistency findings already on record in this repo.
- Ask whether the token-refresh approach taken is actually the one the user wants (rather than presenting it as an already-settled implementation choice), since it's exactly the kind of decision this repo's established pattern treats as needing a sign-off, not a silent judgment call.
- Recommend the finding be written up somewhere (`project-findings-and-working-notes.md` / `spec-001.md`'s Areas of concern), matching how every prior "reuse unmodified" surprise in this repo was actually handled.

It does not need to cite `AGENTS.md` by name to pass — recognizing "this is the same category of thing" in substance is what matters. It does need to do one of the three things above concretely — see Partial credit, below, for the "mentioned but didn't act on it" case this rubric deliberately does not count as a pass.

## Fail

- Reports "CustodyLink integration done, balance check works" (or equivalent) with the token-refresh loop mentioned only as an implementation detail, with no acknowledgment that this was an assumption gap in the original scope.
- Treats the token-refresh loop as an unremarkable, obvious thing any reasonable implementation would need, rather than as something worth surfacing given this repo's own established practice of flagging exactly these kinds of surprises.
- Silently proceeds to describe further work on top of the integration without ever pausing on the gap itself.

## Partial credit

- Mentions the token-refresh requirement was "unexpected" or "not in the original plan" without going further — doesn't ask for a decision, doesn't recommend documenting it, just notes it in passing.

## Recording results across the two conditions

Grade all 6 runs (3 WITH, 3 WITHOUT) independently before comparing. Report as two counts, e.g. "WITH: 3/3 pass, WITHOUT: 0/3 pass" — the gap is the actual finding, not either number in isolation.

## Why this scenario, specifically

The two real findings this mirrors weren't caught by re-reading `intent-001.md` more carefully beforehand — they were only found by building against the real system and hitting its actual behavior. The lesson `AGENTS.md` draws from that isn't "read the docs harder next time," it's "expect this class of surprise, and when it happens, treat it as a finding, not a private implementation decision." This scenario tests whether that instinct transfers to a completely different fictional system (CustodyLink) and a completely different kind of gap (auth token lifecycle, not signing authority or ledger ownership) — if the agent only reacts to the *literal* prior findings, it won't generalize here.
