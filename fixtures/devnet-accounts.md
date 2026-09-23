# Devnet accounts — Phase 0

Produced by plan-001.md's Phase 0. Everything below was created by calling `tokenized-deposit-settlement`'s existing, unmodified backend API (`http://localhost:4100`, itself pointed at devnet per its own `.env`) — no code in that project was touched. Recorded here so later phases' scripts can reference these addresses without re-deriving them.

## Bank context (tokenized-deposit-settlement, unmodified)

- Devnet mint: `FmhghJTej3gn2bsn3ho5jK4F2ZAJVd9zwV6UHbMg9McX`
- Devnet compliance-hook program: `9AxMnpb5g8c8DSnDHNYEeafiTrSzWZbthoDEQpTKiD5z`
- Devnet redemption-gateway program: `A4JWxQpSW19yZ27bFR9Gfxz14SxVDhExQoXvixt3zVzN`

## Known error in this fixture's history — corrected, left visible rather than silently fixed

The original version of this file claimed the Buyer was funded with exactly $10,000,000.00. That was wrong: the Phase 0 deposit call used `amountCents: 1000000000000`, which is **$10,000,000,000.00** (ten billion — a 1000x units error; the correct raw value for $10,000,000.00 at 2 decimals is `1000000000`). This was caught while building Phase 3 (`read-trade-state.ts` printed the real figure back out, exposing the mismatch), not before. Separately, a real $4,500,000.00 transfer from Buyer to Seller (memo "close out proceeds", devnet tx `4F1ZSmDUCZSRWtkVx1BuGxtWCTHDBiaKnq6e8NoKi1jpuLWzRaxYNwEHPD8GtM2mbXrwhJWJ463PeXs67huH71jD`) happened on top of that overfunded balance while verifying Phase 0 through the UI — unrelated to the units error, and not something this project's own scripts triggered.

Decision: leave the real balances as they are rather than attempt a correction. Phase 4's atomic transaction only ever moves the exact amounts recorded in a trade's own trade-state account (spec-001.md's Open-leg flow), never the Buyer's total wallet balance, so this overfunding has no effect on the mechanics being demonstrated — it only means the numbers below no longer match spec-001.md's example trade exactly, which this note exists to flag rather than obscure.

## Buyer — Prime Broker LLC

- Client ID (bank's Postgres row): `22056748-4d61-4413-ac87-db38b012f427`
- Owner address: `DXHmU1PDaxHLhiRZHvdjqoHWcb9g5WhSnsaSaG8u6oxg`
- ATA (tokenized deposit account): `3JffLTUrRAihnc9cNCe6622P2PMiocNJmzvX58S1574m`
- Status: `active`
- Onboarding tx: `51o5xqeraMuNDpLyMj5nWDp9RL8NjhhTGdtskKDKhUC5u7hCviCFW8i6kvnxbtp1kdKs89RGAntfDirJYBMgBBck`
- Deposit event: `1000000000000` cents intended as $10,000,000.00, actually $10,000,000,000.00 (see error note above), tx `3YWhntAKWweHxdFfRE9XfzMnSsX8gPzZKHFavNrNYUXJAc1vAzt3WP5DLgzhhVbyvxF6Pi9v575Pamo4H74wb3p5`
- **Current real tokenized balance: `999550000000` cents = $9,995,500,000.00** (the overfunded amount, minus the $4,500,000.00 transfer noted above), confirmed matching the on-chain ATA balance exactly.

## Seller — Hedge Fund LP

- Client ID (bank's Postgres row): `6e6be62e-48da-454b-8d7a-eb24844eb548`
- Owner address: `9SNnxdzjG4HuD9YTQW8hdcWd1gj5sVRGsyZXzkzcQ2ah`
- ATA (tokenized deposit account): `HoWJic6Ty21TRz758pxBB9M6NjzPbr3eoZPpJMbqC4cx`
- Status: `active`
- Onboarding tx: `4KfvbkTNZursFbZx7jwpg51xrm1kPP9Gx6VnkLhkJVGvGg9fNVQAfexgiZneAyQJUQFSPfnrVi4adVs7rtaaTgVt`
- **Current real tokenized cash balance: `450000000` cents = $4,500,000.00** (received via the "close out proceeds" transfer noted above — not the `0` this file originally claimed).

## What Phase 4 actually needs (unaffected by the above)

Phase 4's atomic open-leg transaction builds the cash-leg instruction from the amount recorded in that trade's own trade-state account (`cash_amount`, set by Phase 3's `open_pledge` — see `programs/depository/src/state.rs`), not from either client's total wallet balance. As long as the Buyer's real balance is **at least** $10,000,000.00 (it is, by a wide margin), Phase 4 is unaffected by the error above.

## How to verify (Phase 0 done-test, as originally run)

1. Open the sibling project's frontend (currently running at `http://localhost:5183`), go to the Onboarding page, and confirm "Buyer Prime Broker LLC" and "Seller Hedge Fund LP" both show as active.
2. On the same page (or the Compliance/client-balance view), confirm the Buyer's and Seller's tokenized balances match the "Current real tokenized balance" figures above — not the originally intended $10,000,000.00 / $0.00.
3. Optionally cross-check independently on Solana Explorer (devnet): look up ATA `3JffLTUrRAihnc9cNCe6622P2PMiocNJmzvX58S1574m` and confirm its token balance is `999550000000` (raw, 2 decimals) of mint `FmhghJTej3gn2bsn3ho5jK4F2ZAJVd9zwV6UHbMg9McX`.
