/// Single, fixed, program-wide delegate authority — mirrors
/// redemption-gateway's GATEWAY_SEED pattern (spec-001.md's `Approve` is
/// scoped by the (owner, amount) pair per trade; the delegate address
/// itself doesn't need to vary per trade). Shared across every
/// instruction that exercises or releases the pledge.
pub const DEPOSITORY_AUTHORITY_SEED: &[u8] = b"depository-authority";

/// spec-001.md's grace period for both default paths: 1 business day
/// past scheduled close (GMRA fails-are-a-market-feature rationale).
/// POC simplification: a flat 86400 seconds, not a real business-day
/// calendar (no weekend/holiday awareness) — the same simplification
/// already used for the overnight term itself.
pub const GRACE_PERIOD_SECONDS: i64 = 86400;
