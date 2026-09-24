/// Single, fixed, program-wide delegate authority — mirrors
/// redemption-gateway's GATEWAY_SEED pattern (spec-001.md's `Approve` is
/// scoped by the (owner, amount) pair per trade; the delegate address
/// itself doesn't need to vary per trade). Shared across every
/// instruction that exercises or releases the pledge.
pub const DEPOSITORY_AUTHORITY_SEED: &[u8] = b"depository-authority";
