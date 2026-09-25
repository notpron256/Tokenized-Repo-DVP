# Retired trades

## Trade `4SUroe12Y2YZCVEnMpwT61qgfw3H5j5jv7DoASvpcmtQ` — permanently stuck at `Open`, cannot be closed

Opened during Phase 4 at the *first* corrected trade size ($4,000,000 cash / $4,081,633 collateral / $4,000,405.56 close — see spec-001.md's Example trade section for the full history of both corrections). Rehypothecated and returned successfully during Phases 5–6, leaving collateral back `AtSeller` — but its `close_cash_amount` ($4,000,405.56) exceeds the Seller's own medium-risk velocity cap ($2,000,000/hour), discovered only when actually attempting to close it. No amount of waiting fixes this: the velocity check compares a single transfer's own amount against the cap on a fresh window, so a $4,000,405.56 transfer fails unconditionally, every time. Splitting the repayment across two smaller transfers in separate windows was considered and rejected — it would mean partially returning cash before the pledge is released, exactly the non-atomic settlement-fails scenario this project's atomicity design exists to eliminate.

**Left as-is, not force-closed.** Same honesty pattern as the Buyer's leftover overfunded balance (`fixtures/devnet-accounts.md`): a real artifact of a sizing mistake, documented rather than hidden or silently worked around. This trade's on-chain state stays exactly as it is — `Status: Open`, `Collateral location: AtSeller`, real pledge delegate still active — as a permanent record of the incident.

## Trade `9j6eEh7Lc7MkYNktuf6EtVfAUkzsfSD1agzxGbAXbTKW` — Seller-defaulted under the pre-fix `CollateralLocation` enum

The first real Seller-default claim (Phase 7's "after deadline" done-test), executed successfully before `CollateralLocation` gained its `AtBuyerClaim` variant. Looking this trade up today with `read-trade-state.ts` shows `Status: SellerDefaulted` (accurate) but `Collateral location: AtSeller` (stale/misleading — the collateral actually moved to claim account `BeC82FGUXZ76xKLvLf6NdJcoTmdQzH5v8FBLhyBX4zZv`, confirmed via `spl-token display` at the time). Same precedent as the other retired trades: left exactly as-is, not retrofitted — the on-chain account was already written under the old program logic, and rewriting historical, terminal trade-state accounts to match a later schema fix isn't something this project does. Trade `DQNSNcmis6KsHbWmmyTuCLPNAJ2aQjGVHWgMm37A2fzK` (claim tx `3hDEdneVg7QG8n6nxwXip3TsDTN6dBEaGLEp3oxpKjwh6T5H3tRxeDkb52Yj3obQnzyKKbsXhopgHVi7ooVsTGMn`) is the one that demonstrates the corrected behavior: `Collateral location: AtBuyerClaim`, matching reality.

## Trade `6BFdXPm11MFcbEEEevgHBdjbxWLKYGXVPoqnrCg65n3R` — the active, correctly-sized trade

Opened and rehypothecated at the second, final corrected size: $1,000,000 cash / $1,020,409 collateral / $1,000,101.39 close — comfortably under both the Buyer's ($5,000,000/hour, low risk) and the Seller's ($2,000,000/hour, medium risk) velocity caps. This is the trade Phase 6 onward actually completes the lifecycle on.

- Open transaction: `2EL38RSpoq8rkHoQGVU1zjWTWurnqnQW4C3kEYcU3wT6LM9rAV8EAyCXYH85Yy8YSaDnB4LY55zZiJSrt5hbw7Pa`
- Rehypothecation transaction: `3s68R4amuosStriunjNgRp7gTygXRnFzxzLXmQRrqqWZfhdaXmxz4RDLofzqYiyrtkByGMTwRYwahSAAuojNB7oY`
- Buyer's-use account: `FY5g1aarAEeut6feqUbQ88W4hM5FNEhcHBp2rim6wgwj`
