//! The single grace-period boundary comparison shared by both default
//! paths (seller_default_claim, buyer_default_claim) — extracted to one
//! pure function so the exact-boundary decision spec-001.md's Failure/
//! unwind at close section resolves (a claim is valid at exactly the
//! deadline second, not only strictly after it: `now >= deadline`, not
//! `now > deadline`) is enforced in exactly one place, not duplicated
//! across two instruction handlers where it could silently drift.

use crate::error::DepositoryError;

/// Returns whether a claim is valid: whether `now` has reached or passed
/// `scheduled_close_unix + grace_period_seconds`. Inclusive of the exact
/// deadline second — see spec-001.md's Exact-boundary resolution.
pub fn grace_period_elapsed(
    now: i64,
    scheduled_close_unix: i64,
    grace_period_seconds: i64,
) -> std::result::Result<bool, DepositoryError> {
    let deadline = scheduled_close_unix
        .checked_add(grace_period_seconds)
        .ok_or(DepositoryError::Overflow)?;
    Ok(now >= deadline)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCHEDULED_CLOSE: i64 = 1_000_000;
    const GRACE_PERIOD: i64 = 86_400;
    const DEADLINE: i64 = SCHEDULED_CLOSE + GRACE_PERIOD;

    #[test]
    fn rejects_one_second_before_the_deadline() {
        assert_eq!(
            grace_period_elapsed(DEADLINE - 1, SCHEDULED_CLOSE, GRACE_PERIOD).unwrap(),
            false
        );
    }

    #[test]
    fn accepts_exactly_at_the_deadline() {
        assert_eq!(
            grace_period_elapsed(DEADLINE, SCHEDULED_CLOSE, GRACE_PERIOD).unwrap(),
            true
        );
    }

    #[test]
    fn accepts_one_second_after_the_deadline() {
        assert_eq!(
            grace_period_elapsed(DEADLINE + 1, SCHEDULED_CLOSE, GRACE_PERIOD).unwrap(),
            true
        );
    }

    #[test]
    fn rejects_on_overflow() {
        assert!(grace_period_elapsed(0, i64::MAX, 1).is_err());
    }
}
