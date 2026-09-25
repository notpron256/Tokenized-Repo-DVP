//! Pledge-release instruction (spec-001.md's Close-leg flow, step 3).
//! `Revoke`s the delegate allowance over the Seller's custodied position
//! and marks the trade closed — gated on collateral_location == AtSeller,
//! so a rehypothecated trade must go through return_rehypothecated first.
//!
//! Owner-signed (`invoke`): SPL Token's `Revoke` requires the account
//! OWNER's signature, not the delegate's (spec-001.md's "the Depository's
//! PDA Revokes..." names the actor correctly — the Depository — but the
//! actual signer is depository_ops as owner, the same as open_pledge's
//! `Approve`, never the PDA itself; the PDA is only ever used as a
//! transfer delegate, never for Approve/Revoke).
//!
//! Safe to call even if the delegate was already cleared automatically
//! (spl-token clears a delegate once its allowance is fully spent — see
//! Phase 5's rehypothecation exercise): Revoke is a no-op-safe reset,
//! not an error, when no delegate is currently set.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;

use crate::error::DepositoryError;
use crate::state::{CollateralLocation, TradeState, TradeStatus};

const REVOKE_DISCRIMINATOR: u8 = 5;

pub fn handler(ctx: Context<ReleasePledge>) -> Result<()> {
    {
        let trade_state = &ctx.accounts.trade_state;
        require!(trade_state.status == TradeStatus::Open, DepositoryError::TradeNotOpen);
        require!(
            trade_state.collateral_location == CollateralLocation::AtSeller,
            DepositoryError::CollateralNotAtSeller
        );
        require_keys_eq!(
            trade_state.seller_custodied_account,
            ctx.accounts.seller_custodied_account.key(),
            DepositoryError::AccountMismatch
        );
    }

    let ix = Instruction {
        program_id: ctx.accounts.token_program.key(),
        accounts: vec![
            AccountMeta::new(ctx.accounts.seller_custodied_account.key(), false),
            AccountMeta::new_readonly(ctx.accounts.depository_ops.key(), true),
        ],
        data: vec![REVOKE_DISCRIMINATOR],
    };

    invoke(
        &ix,
        &[
            ctx.accounts.seller_custodied_account.to_account_info(),
            ctx.accounts.depository_ops.to_account_info(),
        ],
    )?;

    let trade_state = &mut ctx.accounts.trade_state;
    trade_state.status = TradeStatus::Closed;

    Ok(())
}

#[derive(Accounts)]
pub struct ReleasePledge<'info> {
    pub depository_ops: Signer<'info>,
    #[account(mut)]
    pub trade_state: Account<'info, TradeState>,
    /// CHECK: validated implicitly by the token program during the CPI
    #[account(mut)]
    pub seller_custodied_account: UncheckedAccount<'info>,
    /// CHECK: must be the SPL Token program; passed explicitly
    pub token_program: UncheckedAccount<'info>,
}
