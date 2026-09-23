# Security-leg accounts — Phase 2

Produced by `npm run create-security-mint` (plan-001.md Phase 2), run against the **local validator** (`http://127.0.0.1:8899`) — local-first through Phase 3, per plan-001.md's Structural decision. This same script will need to be re-run pointed at devnet (`SOLANA_RPC_URL=https://api.devnet.solana.com`) before Phase 4, since the real cross-institution transaction needs this security position to exist on devnet too.

- Security mint (base SPL Token, decimals 2 — plan-001.md Ambiguity #1): `HY1kMJAVjqvwiBjDkZWYNdBqPGCB3izQpCLkzKL2RhA2`
- Depository-ops authority (mint authority / custodian owner): `2wzhTPw8cVXNYfRh2K3jmkmT2ANXpZhqwDnnmwFrieGN`
- Seller custodial account (Depository-owned — stands in for "the Seller's Depository-custodied token account" per spec-001.md): `2J5nWj72tgqGQrX4M7ExXjLsCV7hhLUHw2dhfjQJnqya`
- Balance: 10,204,082.00 (exactly the example trade's pledge face value, spec-001.md's Example trade)
- Mint transaction: `5dVRYTikUFrCrQ42z7uEZpkrGsGfWFDArnF1prkCubg5QAKFK62Nsw3wQMFE9gUez6hViEvxbniUWpduWt9oicM5`
- Funding transaction: `2CQuzz12hv98spB68adjA16JBVHAnvQ1xWp78aFYpN1sVZaEJRV8AC4pti3tJNXawvnqawb8qPmKEqtw2myNWDcG`

## How to verify (Phase 2 done-test)

```
spl-token display 2J5nWj72tgqGQrX4M7ExXjLsCV7hhLUHw2dhfjQJnqya --url http://127.0.0.1:8899
```

Independently confirmed:
```
SPL Token Account
  Address: 2J5nWj72tgqGQrX4M7ExXjLsCV7hhLUHw2dhfjQJnqya
  Program: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
  Balance: 10204082
  Decimals: 2
  Mint: HY1kMJAVjqvwiBjDkZWYNdBqPGCB3izQpCLkzKL2RhA2
  Owner: 2wzhTPw8cVXNYfRh2K3jmkmT2ANXpZhqwDnnmwFrieGN
  State: Initialized
  Delegation: (not set)
```

`Program` is the classic SPL Token program (`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`), not Token-2022 — matching spec-001.md's Token design. `Owner` matches the depository-ops authority above, not the Seller — matching spec-001.md's Custody model. `Delegation: (not set)` is expected at this point — the pledge `Approve` doesn't happen until Phase 3.
