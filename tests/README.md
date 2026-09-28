# Module 4 (Test): automated test suite

Three independent suites, split by what they actually need to run against — never mixed, so a devnet-dependent test can't silently become the reason a pure-logic test is flaky.

## `tests/local/` — Depository program logic (Phases 1-3, 5, 7-8)

Runs against a dedicated, ephemeral `solana-test-validator` this suite spins up itself (a different port range than this project's own long-running manually-tested validator, and a fresh temp ledger every run) — never devnet, since none of this logic depends on the bank's reused system and shouldn't be subject to devnet's real velocity caps or general flakiness (plan-001.md's Structural decision already drew this same boundary for Phases 1-3; this extends it to 5, 7, and 8, which are equally Depository-only).

**Prerequisite:** `anchor build` (the suite deploys whatever's currently in `target/deploy/depository.so`, it doesn't build it).

**Run:**
```
anchor build
npx tsx --test tests/local/depository.test.ts
```

**Coverage:**
- `open_pledge` — creates the trade-state, approves exactly the face value to the Depository PDA; a guard test for a second `open_pledge` against an already-pledged custodied account (`AccountAlreadyPledged`), independently confirming via `getAccount()` that a real delegate exists both before and after the rejected attempt.
- `exercise_rehypothecation` — **regression test for the Phase 5 `TransferChecked`/`ApproveChecked` discriminator bug**: asserts real balance deltas (not just transaction success) on both accounts, and that the delegate auto-clears; a guard test for double-exercise; a guard test for exercising against a *Closed* trade's stale trade-state even when the underlying custodied account currently has a live delegate from a later trade (found by mutation-testing the `status == Open` check — see "Mutation testing," below).
- `return_rehypothecated` — moves collateral back, resets `collateral_location`.
- `release_pledge` — revokes the delegate, marks `Closed`; a guard test for releasing while still rehypothecated.
- `seller_default_claim` — rejects before the grace-period deadline, succeeds after it (moves collateral, sets `SellerDefaulted` + `AtBuyerClaim`), rejects if collateral was already exercised.
- `buyer_default_claim` — rejects before the deadline, succeeds after it (status-only: asserts the Buyer's-use balance is *unchanged* before vs. after, not just that the call succeeded), rejects if collateral was never rehypothecated.
- `grace-period boundary` — the exact deadline crossing, for both directions, checked against the validator's own on-chain Clock sysvar rather than a wall-clock sleep (see "A real timing finding," below). The precise `>=` vs. `>` boundary itself now also has direct, deterministic coverage at the Rust unit level (`programs/depository/src/grace_period.rs`), since an on-chain integration test can only ever land near the exact second, not guaranteed exactly on it.

### `expectAnchorError` coverage: every guard it protects, and its mutation-check status

`expectAnchorError` has 8 call sites across 7 distinct guards (an earlier write-up of the bug below said "five" — that was wrong; corrected here). Every one has now been mutation-tested against the fixed helper (see the bug writeup right after this table) — removing or bypassing the named guard was confirmed to make the listed test fail, then the mutation was reverted:

| # | Test | Guard | Instruction |
|---|---|---|---|
| 1 | `exercise_rehypothecation` — "rejects a second exercise once collateral is already AtBuyerUse" | `collateral_location == AtSeller` | `exercise_rehypothecation.rs` |
| 2 | `exercise_rehypothecation` — "rejects exercise against a Closed trade's stale trade-state..." | `status == Open` | `exercise_rehypothecation.rs` |
| 3 | `release_pledge` — "rejects release while collateral is AtBuyerUse" | `collateral_location == AtSeller` | `release_pledge.rs` |
| 4 | `seller_default_claim` — "rejects before the grace-period deadline" | `grace_period_elapsed` | `seller_default_claim.rs` |
| 5 | `seller_default_claim` — "rejects if collateral is already AtBuyerUse" | `collateral_location == AtSeller` | `seller_default_claim.rs` |
| 6 | `buyer_default_claim` — "rejects before the grace-period deadline" | `grace_period_elapsed` | `buyer_default_claim.rs` |
| 7 | `buyer_default_claim` — "rejects if collateral is AtSeller" | `collateral_location == AtBuyerUse` | `buyer_default_claim.rs` |
| 8 | `grace-period boundary` — "rejects before the deadline..." | `grace_period_elapsed` (same guard as #4, exercised via the boundary test instead of the wide-margin one) | `seller_default_claim.rs` |

### A real timing finding, hit while building this suite

A local validator's on-chain clock does **not** reliably track wall-clock time under this suite's own transaction load — in one observed run, it fell more than 40 real seconds behind. A boundary test built around "sleep N real seconds, then expect the deadline to have passed" is fundamentally the wrong tool for this: it can fail even though the program logic is completely correct (which it is — proven independently on devnet in Phase 7 against real, hours-aged trades). `tests/local/helpers/clock.ts` polls the actual Clock sysvar directly and waits until it passes the target, which is robust regardless of how fast or slow the validator's slots are actually advancing.

Three more real, non-obvious things found and fixed while building this validator harness (`tests/local/helpers/validator.ts`):
- `solana-test-validator`'s WebSocket/pubsub port is always RPC port + 1, not independently configurable — an explicit `--faucet-port` set to that same value collided with it and produced an opaque `solana program deploy` failure ("Should return a valid tpu client").
- `--dynamic-port-range` has an enforced minimum width (~26 ports) and is rejected outright if narrower — with `stdio: "ignore"` on the spawned process, the only symptom was a silent 60-second readiness timeout with no indication why. The helper now pipes stderr and fails fast with the real message instead.
- `@solana/spl-token`'s own high-level helpers (`createAccount`, `mintTo`) occasionally hit a transient "Unable to obtain a new blockhash" under this suite's rapid-fire transaction load; since they run their own internal `sendAndConfirmTransaction` this suite has no way to wrap directly, `tests/local/helpers/send.ts` retries the whole call instead of the send.

### A real hang, root-caused: an orphaned WebSocket client, not a validator crash

Across several runs while building this suite, the whole `tsx --test` process was observed to hang indefinitely after the validator was torn down — once for over two and a half days before it was noticed. It looked like the validator was crashing mid-run (the validator process was gone, `ps` showed the test process at 0% CPU, RPC calls failed with `ECONNREFUSED`), and was initially misdiagnosed that way. Directly comparing a hung run's own captured log against its live process state revealed the real story: `node:test` had already finished and printed `tests 13 / pass 13 / fail 0` — every test had genuinely passed — and the process simply never exited afterward.

The actual cause: `@solana/web3.js`'s classic `Connection` opens a WebSocket subscription client (needed for `"confirmed"`-commitment confirmations) that has no public teardown method. Once `stopEphemeralValidator()` kills the validator process at the end of a normal run, that client's internal reconnect logic retries forever, which keeps a timer alive and Node's event loop with it — so the process never exits even though the actual test outcome was already decided and printed. `stopEphemeralValidator()` now explicitly closes it (`connection._rpcWebSocket.close()`, a private field — there's no supported public API for this on the classic `Connection` class) before killing the validator process, which lets the process exit naturally with the correct code.

`tests/local/helpers/validator.ts` also fails fast (rather than hanging) if the validator process dies unexpectedly *during* an actual run, as a separate safety net — but that scenario was never actually observed here; every hang traced back to the WebSocket issue above, not a real crash.

This fix touches `Connection`'s private, undocumented `_rpcWebSocket` field, which a future `@solana/web3.js` upgrade could rename or remove and silently reintroduce this exact hang — see `project-findings-and-working-notes.md`'s Module 4 entry for the full incident writeup.

## `tests/ledger/` — the bank ledger-mirror write's idempotency

Needs only the bank's local Postgres (already running via its own `docker-compose`, per Phase 0) — no Solana RPC, no validator, no devnet.

**Run:**
```
npx tsx --test tests/ledger/mirror-idempotency.test.ts
```

**Coverage:** calls `recordSettledCashLegIfNeeded` twice with the same (fake, never-real) signature and asserts the second call is a no-op — the balance delta reflects exactly one application, not two, and there's exactly one `transfer_events` row. This is the actual regression this repo's own bounded-consistency-window design (spec-001.md's Areas of concern) depends on holding. The test cleans up its own effect afterward, so it's safe to run repeatedly against the real bank database.

## `tests/devnet/` — the parts that genuinely require the bank's reused system (Phases 4, 6)

Per plan-001.md's Structural decision, this can't run against a local validator — the bank's programs only exist on devnet.

**⚠️ This suite permanently adds clients to the bank's real devnet Postgres, and there is no cleanup mechanism anywhere in the reused bank system to undo that (see "Cost of a run," below).** It must never run unattended — not on every push, not on a schedule, not in any CI job that doesn't require a human to deliberately opt in each time.

**Opt-in only, deliberately not part of `npm test`:** running `npm run test:devnet` requires setting `I_UNDERSTAND_THIS_ADDS_PERMANENT_TEST_CLIENTS=1` — `tests/devnet/guard.ts` refuses to run (before anything in `atomicity.test.ts`, including its own `before()` hook, ever executes) without it. This isn't a suggestion in this README that a CI config could quietly ignore; it's an actual, enforced precondition.

**Prerequisites:** the bank's backend + Postgres running locally (Phase 0), the Depository program already deployed to devnet, and its security mint already created (`scripts/create-security-mint.ts` against devnet).

**Run:**
```
SOLANA_RPC_URL=https://api.devnet.solana.com I_UNDERSTAND_THIS_ADDS_PERMANENT_TEST_CLIENTS=1 npm run test:devnet
```

**Coverage:**
- Phase 4 happy path: both legs land atomically with correct balance deltas.
- Phase 4 negative path: **a repeatable version of the one-time manual atomicity demonstration** — a deliberately invalid amount fails the whole transaction, verified against the bank's own `/clients` endpoint (its real Postgres-backed `tokenizedCents`), confirming neither party's balance moved at all.
- Phase 6 close, without rehypothecation.
- Phase 6 close, with rehypothecation (the fungibility proof — same code path, no special-casing which tokens came back).

### Cost of a run: permanent, unremovable rows in the bank's real Postgres

Every run onboards a fresh Buyer/Seller pair (`tests/devnet/helpers/fresh-clients.ts`) via the bank's real `/clients` and `/deposits` endpoints — genuinely inserting rows into `clients`, `client_keys`, and `ledger_balances` in `tokenized-deposit-settlement`'s actual Postgres, the same database its own real onboarding flow writes to. **There is no delete endpoint and no automated suspension anywhere in that backend's routes** — `clients.status` supports a `'suspended'` value in the schema, but no code path ever sets it. Every devnet run leaves its fixture clients behind forever, identifiable later by name prefix (`"Test Fixture Buyer/Seller <suffix>"`) or KYC-reference pattern (`TEST-2026-<suffix>`) if a manual cleanup is ever wanted, but nothing here does that automatically.

### Avoiding velocity-window collisions, deliberately

Every test in this file onboards a **fresh Buyer/Seller pair** (`helpers/fresh-clients.ts`) once per run, rather than reusing Buyer Prime Broker LLC / Seller Hedge Fund LP — the exact fixtures Phase 9 and manual verification have already been exercising, and the reason this project hit two separate velocity-cap incidents (`AGENTS.md`). A fresh pubkey always starts with a zero velocity window regardless of history, which fully removes the collision risk rather than documenting a pacing requirement and hoping it's followed. All of this file's tests reuse the same pair (onboarded once in a `before()` hook) and stay far enough under both parties' real caps — Buyer low-risk $5,000,000/hr, Seller medium-risk $2,000,000/hr — that running the whole file in one pass never risks tripping either one; the amount comments in the file itself show the actual headroom.

`open-trade.ts` and `close-trade.ts` gained `--buyer-client-id`/`--seller-client-id` overrides (and `open-trade.ts` already had amount overrides, added for Phase 9) specifically to make this possible without duplicating their already-verified transaction-building logic — this suite shells out to the real scripts, the same way `scripts/e2e-full-lifecycle.ts` does, rather than reimplementing them.

## What's deliberately not covered here

- Anything in the deferred backlog (Path 1 confidentiality, partial close, the netting/cross-default layer) — nothing to test yet, since nothing's built.
- Liquidation execution, income payments, margin maintenance, substitution — all named out of scope in spec-001.md's Areas of concern; there's no code path to test.
- The devnet ledger-mirror write's own idempotency is covered in `tests/ledger/`, not duplicated in `tests/devnet/` — it needs Postgres, not a real transaction, to exercise meaningfully.
