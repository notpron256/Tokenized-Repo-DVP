//! Trade-state account (spec-001.md, Token design). Tracks one repo
//! trade's terms and current lifecycle status, including the
//! collateral-location field the Buyer-default check (spec-001.md,
//! Failure/unwind at close) evaluates at the grace-period deadline.

use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct TradeState {
    /// Placeholder CUSIP-shaped security identifier (spec-001.md, Example
    /// trade: "specific CUSIP treated as a placeholder parameter").
    #[max_len(9)]
    pub security_id: String,
    /// Pledged face value, raw units at the security mint's decimals.
    pub face_value: u64,
    /// Cash principal, raw units at the bank mint's decimals.
    pub cash_amount: u64,
    /// Cash owed at close (principal + accrued interest), raw units.
    pub close_cash_amount: u64,
    /// Unix timestamp of the scheduled close date. The grace-period
    /// deadline for both default paths (spec-001.md) is this plus one
    /// business day.
    pub scheduled_close_unix: i64,
    /// Repo rate in basis points (e.g. 365 = 3.65%).
    pub rate_bps: u32,
    pub day_count: DayCount,
    pub status: TradeStatus,
    pub collateral_location: CollateralLocation,
    pub seller_custodied_account: Pubkey,
    /// Set by the rehypothecation-exercise instruction (Phase 5);
    /// Pubkey::default() until then.
    pub buyer_use_account: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum DayCount {
    Actual360,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum TradeStatus {
    Open,
    Closed,
    SellerDefaulted,
    BuyerDefaulted,
}

/// Pure physical placement, never conflated with trade lifecycle (that's
/// TradeStatus's job — see its four values, which already fully and
/// unambiguously distinguish Open/Closed/SellerDefaulted/BuyerDefaulted
/// without any help from this enum). A new variant here is warranted
/// only when the actual custody account changes and an existing value
/// would become a false statement about where the tokens are — not
/// merely because a new trade-lifecycle status was added.
///
/// AtBuyerUse deliberately covers both "Open, voluntarily rehypothecated"
/// and "BuyerDefaulted" — both are physically identical (the tokens
/// never move once rehypothecated; a Buyer default is a status-only
/// trigger, spec-001.md's Ambiguity #4, so nothing here needs to change
/// when it fires). AtSeller deliberately covers both "Open, never
/// rehypothecated" and "Closed" — both are physically identical too
/// (the happy-path close only runs once collateral is already back).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum CollateralLocation {
    AtSeller,
    AtBuyerUse,
    /// Set only by seller_default_claim — the one case where custody
    /// genuinely moves to a new account after open, so the prior value
    /// (AtSeller) would otherwise become false. Self-sufficient: no
    /// other instruction ever produces this value, so seeing it alone
    /// already tells you a Seller-default claim occurred, with no need
    /// to also check status.
    AtBuyerClaim,
}
