//! Buyer-default claim (spec-001.md's Failure/unwind at close, Buyer
//! default; plan-001.md's Ambiguity #4). A status-only trigger — moves
//! no funds, because none can be moved: the pledged collateral is
//! genuinely gone from the Seller's custody, sitting in the Buyer's-use
//! account since it was rehypothecated, and stays exactly there whether
//! or not this instruction ever runs. This only marks, on-chain, that
//! the Buyer failed to return equivalent securities by the grace-period
//! deadline — the real-world consequence (a cash claim against the
//! Buyer, via MRA's actual cross-default mechanism — see spec-001.md's
//! Areas of concern, MRA mechanics reviewed and deliberately not
//! modeled) is out of scope, not silently assumed to be handled here.
//!
//! Mechanical trigger, not an abstract one (spec-001.md): the pledged
//! tokens have not been moved back from the Buyer's-use account to the
//! Seller's custodied account by the deadline — checked directly against
//! collateral_location, the same field return_rehypothecated would have
//! flipped back to AtSeller had the Buyer actually returned in time.

use anchor_lang::prelude::*;

use crate::constants::GRACE_PERIOD_SECONDS;
use crate::error::DepositoryError;
use crate::state::{CollateralLocation, TradeState, TradeStatus};

pub fn handler(ctx: Context<BuyerDefaultClaim>) -> Result<()> {
    let trade_state = &mut ctx.accounts.trade_state;

    require!(trade_state.status == TradeStatus::Open, DepositoryError::TradeNotOpen);
    require!(
        trade_state.collateral_location == CollateralLocation::AtBuyerUse,
        DepositoryError::CollateralNotAtBuyerUse
    );

    let now = Clock::get()?.unix_timestamp;
    let deadline = trade_state
        .scheduled_close_unix
        .checked_add(GRACE_PERIOD_SECONDS)
        .ok_or(DepositoryError::Overflow)?;
    require!(now >= deadline, DepositoryError::GracePeriodNotElapsed);

    trade_state.status = TradeStatus::BuyerDefaulted;

    emit!(BuyerDefaultEvent {
        trade_state: trade_state.key(),
        buyer_use_account: trade_state.buyer_use_account,
        face_value: trade_state.face_value,
        timestamp: now,
    });

    Ok(())
}

#[event]
pub struct BuyerDefaultEvent {
    pub trade_state: Pubkey,
    pub buyer_use_account: Pubkey,
    pub face_value: u64,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct BuyerDefaultClaim<'info> {
    /// Authorizes this instruction on the Seller's off-chain instruction
    /// (mirrors the Buyer-initiated authorization pattern of the other
    /// exercise/claim instructions, from the other side).
    pub depository_ops: Signer<'info>,
    #[account(mut)]
    pub trade_state: Account<'info, TradeState>,
}
