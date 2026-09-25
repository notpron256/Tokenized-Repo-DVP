# Project findings and working notes

Real issues and non-obvious discoveries hit while building this project, recorded as they happen — not a design document (see `intent/`, `spec/`, `plan/` for that).

## Phase 3 — `anchor deploy`'s auto-extend step fails against this validator (`ExtendProgram` superseded by `ExtendProgramChecked`)

Redeploying the `depository` program after it grew past its original allocated size (adding `open_pledge` in Phase 3) failed under `anchor deploy`:

```
Auto-extending program data by 86120 bytes (57856 → 143976) before upgrade…
Attempt 3 failed: Auto-extend failed: RPC response error -32002: Transaction simulation failed: Error processing Instruction 0: invalid instruction data; 3 log messages:
  Program BPFLoaderUpgradeab1e11111111111111111111111 invoke [1]
  ExtendProgram was superseded by ExtendProgramChecked
  Program BPFLoaderUpgradeab1e11111111111111111111111 failed: invalid instruction data
```

This is a real incompatibility between `anchor-cli 1.1.2`'s deploy path (which still issues the BPF Loader Upgradeable program's older `ExtendProgram` instruction when it needs to grow a program's allocated data account) and this environment's `solana-cli 3.1.10` / validator, whose loader has moved to `ExtendProgramChecked` instead. It only surfaces once a program's compiled size exceeds what was allocated at its *first* deploy — Phase 1's initial skeleton deploy worked fine under `anchor deploy`, since there was no existing allocation to extend yet.

**Workaround:** use `solana program deploy` directly instead of `anchor deploy` for every redeploy from Phase 3 onward:

```
solana program deploy target/deploy/depository.so --program-id target/deploy/depository-keypair.json --url <RPC_URL> --upgrade-authority ~/.config/solana/id.json
```

This succeeds because `solana-cli`'s own deploy path is current with the validator's loader version. `anchor build` itself is unaffected — only `anchor deploy`'s auto-extend step is broken here. No workaround was needed for the initial deploy; this only applies to *re*-deploys of an already-existing program.

## Phase 4 — spec-001.md assumed the wrong signer for the cash leg

While building `scripts/open-trade.ts`, reading `tokenized-deposit-settlement`'s real `backend/src/flows/transferFlow.ts` (unmodified — this was a read, not a change) showed that an ordinary bank transfer is authorized by the **sending client's own custodied keypair**, not any bank operator-level authority: `sendAndConfirmTransaction(connection, tx, [payer, senderKeypair], ...)` — bank-ops never signs an ordinary `Transfer`. Bank-ops only appears for onboarding, funding, and Permanent-Delegate clawback; using it to authorize an ordinary client-to-client transfer would require granting it blanket transfer rights over every account, which is exactly the "wrong on scope, permanence, and ownership" category error spec-001.md already rejected when it ruled out Permanent Delegate for the pledge mechanism.

spec-001.md's Client consent / authorization model originally claimed the settlement transaction carries "the bank's own operator authority" signature on the cash leg. That was wrong about *which key* signs, though not about the practical behavior (no live client action is needed either way) — corrected in place in spec-001.md, with the resulting cash-leg/security-leg asymmetry now stated explicitly rather than implied to be symmetric.

Practical consequence for `scripts/open-trade.ts`: the Buyer's custodied keypair is read directly from `tokenized-deposit-settlement`'s own Postgres (`client_keys` table, via the same `DATABASE_URL` its own backend uses) — a plain `SELECT`, confirmed via `git status --short` on that repo before and after to show zero modification. This is the same read-only recomputation pattern that project's own `identityCommitment.ts` explicitly says its Transaction Evidence view is meant to support, not a workaround invented here.

## Phase 4 — the bank's velocity limit made spec.md's original $10,000,000 example trade structurally unmovable

Also found while building `scripts/open-trade.ts`, before writing any transfer-instruction code: `tokenized-deposit-settlement`'s compliance-hook Transfer Hook enforces a per-client hourly velocity cap (`programs/compliance-hook/src/constants.rs`) that tops out at **$5,000,000/hour even for its lowest-risk, most-permissive tier** (`CAP_LOW_CENTS = 500_000_000`; medium and high are lower still). `check_velocity_limit` in `lib.rs` compares `running_total + amount` against that cap; on a fresh window `running_total` starts at 0, so a single transfer's own amount is what gets checked. A $10,000,000 transfer — spec-001.md's original example-trade cash leg — exceeds even the best tier by 2x, for any client, unconditionally, regardless of prior activity or timing.

Since intent-001.md requires reusing the bank system unmodified, bypassing or raising this cap was not an option. Resolved by scaling the example trade down (user's decision) to a $4,000,000 cash leg / $4,081,633 collateral — comfortably under the $5,000,000 ceiling — recomputing the Actual/360 interest accordingly ($405.56, close return $4,000,405.56). spec-001.md's Example trade section and plan-001.md's phase references were both updated to the corrected figures, with the original numbers and the reason for the change left visible in spec-001.md rather than silently overwritten. The existing Phase 2 security-mint custodial accounts (local and devnet) were not re-minted — their balances already exceed the corrected pledge amount, so no rework was needed there (see `fixtures/security-leg-accounts.md`).

## Phase 4 — reusing the bank "unmodified" for signing means bypassing its own ledger-write path too

A second real architectural consequence of the "reuse unmodified" constraint, alongside the signing-key finding above rather than a one-off bug: because this repo composes and submits the cash-leg transfer itself (required, to combine it atomically with the pledge leg — `tokenized-deposit-settlement`'s own `/transfers` endpoint only ever builds and sends its own separate transaction), the bank's `/transfers` endpoint never runs, and nothing else ever writes its `transfer_events`/`ledger_balances` tables. Confirmed empirically after Phase 4's first successful happy-path run: real on-chain balances were correct (`$9,991,500,000.00` / `$8,500,000.00`, verified via `spl-token display`), but the bank's own Postgres — queried through its live `/clients` endpoint — still showed the pre-trade figures. Left alone, this is a silent, permanent divergence between the bank's own "sole legal source of truth" and reality, for every trade this system ever settles.

Resolved by having `scripts/open-trade.ts` perform the same ledger write `transferFlow.ts` would have, itself, synchronously, right after independently waiting for `"finalized"` commitment (`scripts/lib/finality.ts`, replicated from the bank's own `finality.ts` rather than guessed at) — see `scripts/lib/bank.ts`'s `recordSettledCashLegIfNeeded`. Idempotent via a check-then-insert on `tx_signature`, not a database `UNIQUE` constraint — `transfer_events` has no such constraint today (only `indexer.ts`'s separate `indexed_transfers` table does, via `ON CONFLICT (tx_signature) DO NOTHING`), and adding one would itself be a schema change to the reused project, which is a different, more invasive kind of "modification" than a data read/write and wasn't in scope here. The one already-executed happy-path transaction that predated this code (signature `73aTR2Xq...HuAR`) was backfilled once, by hand, via the same function, rather than executing a redundant second on-chain transfer just to exercise the new code path — confirmed afterward that the bank's `/clients` endpoint matches on-chain state exactly. See spec-001.md's Areas of concern for the full writeup of the bounded consistency window this leaves and why closing it further belongs on the bank's own side, not in this repo.

## Phase 5 (review) — Token-2022 Confidential Transfer is likely incompatible with this project's own delegate/`Approve` pledge mechanism

A load-bearing technical finding, not a design preference: while evaluating whether Confidential Transfer could remediate the trade-economics visibility gap (see spec-001.md's Areas of concern), it became clear the two mechanisms may not compose at all. This project's entire "right of use" design — `open_pledge`'s `Approve`, `exercise_rehypothecation`'s `invoke_signed` `TransferChecked` CPI — depends on the base SPL Token account's plaintext `delegate`/`delegated_amount` fields: a delegate is authorized to move up to a fixed, plaintext integer, checked with a simple on-chain comparison.

Confidential Transfer does not extend that model to encrypted balances; it replaces the transfer path entirely. Every confidential-holding account needs its own ElGamal/AES keypair and must go through `ConfigureAccount`, then `Deposit`/`ApplyPendingBalance` before funds are spendable, and an actual confidential-to-confidential `Transfer` requires the sender to construct zero-knowledge range and equality proofs — proofs that assert facts about ciphertexts the prover must be able to decrypt or compute against. There is no known mechanism by which a delegate that doesn't hold the owner's decryption key could construct a valid proof for a confidential spend on the owner's behalf, the way plain `Approve` lets a delegate spend against a plaintext cap today. This was not verified empirically (no spike was run — Path 2 was deferred rather than built, see spec-001.md), so this is recorded as a strong, reasoned suspicion grounded in how the two mechanisms are structured, not a confirmed dead end — but it's exactly the kind of assumption that burned the sibling project's own Phase 0.5 (`PermissionedBurn` assumed supported, found not to be, only after being built against). Named here so a future attempt at Path 2 starts from this open question rather than re-discovering it.

Secondary, independent risk found the same way: Confidential Transfer's zero-knowledge proof data is large, and historically has needed separate transactions or context-state accounts to fit at all — a real threat to Phase 4's single-transaction atomicity claim, which is already close to Solana's ~1232-byte limit combining just a memo, the Transfer Hook's resolved extra accounts, and one plain instruction (see Phase 4's own memo-trimming entry, above).

## Phase 8 — `solana program deploy`'s own auto-extend math can request less than the loader's minimum increment

A third real deploy-tooling incompatibility, distinct from Phase 3's `anchor deploy`/`ExtendProgram`-vs-`ExtendProgramChecked` finding: deploying the small `buyer_default_claim` addition via plain `solana program deploy` (the already-established workaround for Phase 3's issue) failed outright:

```
ExtendProgram requires a minimum of 10240 additional bytes or to extend to maximum size, but only 5096 were requested
```

`solana program deploy` computes how many bytes to request for `ExtendProgram` from the actual size difference between the currently-deployed program and the new binary — here, 5,096 bytes — but the BPF Loader Upgradeable program enforces its own minimum increment (10,240 bytes) per extend call, independent of what was actually requested. A small enough change (this one, versus the much larger jump from Phase 1's skeleton to Phase 3's first real instruction) can fall below that floor and get rejected outright. Reproduced deterministically on a clean retry, not a one-off network flake.

**Workaround:** extend the program's allocation manually first, past the loader's minimum, before deploying:

```
solana program extend <PROGRAM_ID> 10240 --url <RPC_URL>
solana program deploy target/deploy/depository.so --program-id target/deploy/depository-keypair.json --url <RPC_URL> --upgrade-authority ~/.config/solana/id.json
```

Both failed deploy attempts printed a recovery seed phrase and a `solana program close <buffer>` cleanup command for an "intermediate account" — turned out to be unnecessary here: both attempts failed at transaction *simulation* (never broadcast, per the `RPC response error -32002: Transaction simulation failed` prefix), so no buffer account was ever actually created on-chain and there was nothing to reclaim. Worth checking with `solana program close` before assuming rent is stuck, rather than assuming the recovery instructions always apply literally.
