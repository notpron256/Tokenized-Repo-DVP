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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum CollateralLocation {
    AtSeller,
    AtBuyerUse,
}
