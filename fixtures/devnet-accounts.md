# Devnet accounts — Phase 0

Produced by plan-001.md's Phase 0. Everything below was created by calling `tokenized-deposit-settlement`'s existing, unmodified backend API (`http://localhost:4100`, itself pointed at devnet per its own `.env`) — no code in that project was touched. Recorded here so later phases' scripts can reference these addresses without re-deriving them.

## Bank context (tokenized-deposit-settlement, unmodified)

- Devnet mint: `FmhghJTej3gn2bsn3ho5jK4F2ZAJVd9zwV6UHbMg9McX`
- Devnet compliance-hook program: `9AxMnpb5g8c8DSnDHNYEeafiTrSzWZbthoDEQpTKiD5z`
- Devnet redemption-gateway program: `A4JWxQpSW19yZ27bFR9Gfxz14SxVDhExQoXvixt3zVzN`

## Buyer — Prime Broker LLC

- Client ID (bank's Postgres row): `22056748-4d61-4413-ac87-db38b012f427`
- Owner address: `DXHmU1PDaxHLhiRZHvdjqoHWcb9g5WhSnsaSaG8u6oxg`
- ATA (tokenized deposit account): `3JffLTUrRAihnc9cNCe6622P2PMiocNJmzvX58S1574m`
- Status: `active`
- Onboarding tx: `51o5xqeraMuNDpLyMj5nWDp9RL8NjhhTGdtskKDKhUC5u7hCviCFW8i6kvnxbtp1kdKs89RGAntfDirJYBMgBBck`
- Deposit event: $10,000,000.00 funded, tx `3YWhntAKWweHxdFfRE9XfzMnSsX8gPzZKHFavNrNYUXJAc1vAzt3WP5DLgzhhVbyvxF6Pi9v575Pamo4H74wb3p5`
- Confirmed tokenized balance after funding: `1000000000000` cents ($10,000,000.00), matching the on-chain ATA balance exactly.

## Seller — Hedge Fund LP

- Client ID (bank's Postgres row): `6e6be62e-48da-454b-8d7a-eb24844eb548`
- Owner address: `9SNnxdzjG4HuD9YTQW8hdcWd1gj5sVRGsyZXzkzcQ2ah`
- ATA (tokenized deposit account): `HoWJic6Ty21TRz758pxBB9M6NjzPbr3eoZPpJMbqC4cx`
- Status: `active`
- Onboarding tx: `4KfvbkTNZursFbZx7jwpg51xrm1kPP9Gx6VnkLhkJVGvGg9fNVQAfexgiZneAyQJUQFSPfnrVi4adVs7rtaaTgVt`
- Tokenized cash balance: `0` (Seller is the borrower in this trade — it receives cash at open, not before).

## How to verify (Phase 0 done-test)

1. Open the sibling project's frontend (currently running at `http://localhost:5183`), go to the Onboarding page, and confirm "Buyer Prime Broker LLC" and "Seller Hedge Fund LP" both show as active.
2. On the same page (or the Compliance/client-balance view), confirm the Buyer's tokenized balance reads $10,000,000.00.
3. Optionally cross-check independently on Solana Explorer (devnet): look up ATA `3JffLTUrRAihnc9cNCe6622P2PMiocNJmzvX58S1574m` and confirm its token balance is 1,000,000,000,000 (raw, 2 decimals) of mint `FmhghJTej3gn2bsn3ho5jK4F2ZAJVd9zwV6UHbMg9McX`.
