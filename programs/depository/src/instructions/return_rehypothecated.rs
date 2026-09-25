//! Return-of-collateral instruction (plan-001.md's Ambiguity #3 — spec.md
//! never names this instruction; it's this plan's resolution, mirroring
//! exercise_rehypothecation in reverse). Moves the pledged face value
//! back from the Buyer's-use account to the Seller's custodied account.
//!
//! Owner-signed (`invoke`), not delegate-signed (`invoke_signed`): the
//! Buyer's-use account is directly owned by depository_ops (created that
//! way in Phase 5's scripts/rehypothecate.ts), so no PDA delegate is
//! needed for this leg — the Depository already has direct signing
//! authority over both accounts involved.
//!
//! Fungibility resolves "equivalent, not identical" for free here
//! (spec-001.md, Rehypothecation exercise flow): this instruction only
//! ever checks the trade-state's own recorded face_value and the
//! accounts' addresses, never which specific token units are returned.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;

use crate::error::DepositoryError;
use crate::state::{CollateralLocation, TradeState, TradeStatus};

const TRANSFER_CHECKED_DISCRIMINATOR: u8 = 12;

pub fn handler(ctx: Context<ReturnRehypothecated>, decimals: u8) -> Result<()> {
    {
        let trade_state = &ctx.accounts.trade_state;
        require!(trade_state.status == TradeStatus::Open, DepositoryError::TradeNotOpen);
        require!(
            trade_state.collateral_location == CollateralLocation::AtBuyerUse,
            DepositoryError::CollateralNotAtBuyerUse
        );
        require_keys_eq!(
            trade_state.seller_custodied_account,
            ctx.accounts.seller_custodied_account.key(),
            DepositoryError::AccountMismatch
        );
        require_keys_eq!(
            trade_state.buyer_use_account,
            ctx.accounts.buyer_use_account.key(),
            DepositoryError::AccountMismatch
        );
    }

    let face_value = ctx.accounts.trade_state.face_value;

    let mut data = Vec::with_capacity(10);
    data.push(TRANSFER_CHECKED_DISCRIMINATOR);
    data.extend_from_slice(&face_value.to_le_bytes());
    data.push(decimals);

    let ix = Instruction {
        program_id: ctx.accounts.token_program.key(),
        accounts: vec![
            AccountMeta::new(ctx.accounts.buyer_use_account.key(), false),
            AccountMeta::new_readonly(ctx.accounts.security_mint.key(), false),
            AccountMeta::new(ctx.accounts.seller_custodied_account.key(), false),
            AccountMeta::new_readonly(ctx.accounts.depository_ops.key(), true),
        ],
        data,
    };

    invoke(
        &ix,
        &[
            ctx.accounts.buyer_use_account.to_account_info(),
            ctx.accounts.security_mint.to_account_info(),
            ctx.accounts.seller_custodied_account.to_account_info(),
            ctx.accounts.depository_ops.to_account_info(),
        ],
    )?;

    let trade_state = &mut ctx.accounts.trade_state;
    trade_state.collateral_location = CollateralLocation::AtSeller;

    Ok(())
}

#[derive(Accounts)]
pub struct ReturnRehypothecated<'info> {
    #[account(mut)]
    pub depository_ops: Signer<'info>,
    #[account(mut)]
    pub trade_state: Account<'info, TradeState>,
    /// CHECK: validated implicitly by the token program during the CPI
    #[account(mut)]
    pub seller_custodied_account: UncheckedAccount<'info>,
    /// CHECK: validated implicitly by the token program during the CPI
    #[account(mut)]
    pub buyer_use_account: UncheckedAccount<'info>,
    /// CHECK: validated implicitly by the token program during the CPI
    pub security_mint: UncheckedAccount<'info>,
    /// CHECK: must be the SPL Token program; passed explicitly
    pub token_program: UncheckedAccount<'info>,
}
