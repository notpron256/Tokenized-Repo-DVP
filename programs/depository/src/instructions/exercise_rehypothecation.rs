//! Rehypothecation exercise instruction (spec-001.md's Rehypothecation
//! exercise flow, mid-trade). CPIs into base SPL Token's `TransferChecked`,
//! authorized via the Depository's PDA delegate (`invoke_signed`), moving
//! the pledged face value out of the Seller's custodied account into a
//! separate, per-trade Buyer's-use account — a real, spending transfer,
//! not a log entry asserting that rehypothecation happened.
//!
//! The Buyer's-use account itself is created beforehand by the caller
//! (a plain, non-associated SPL Token account — see scripts/rehypothecate.ts)
//! so this instruction only ever moves tokens and updates trade-state,
//! keeping the Depository program's own logic minimal.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;

use crate::constants::DEPOSITORY_AUTHORITY_SEED;
use crate::error::DepositoryError;
use crate::state::{CollateralLocation, TradeState, TradeStatus};

const TRANSFER_CHECKED_DISCRIMINATOR: u8 = 12;

pub fn handler(ctx: Context<ExerciseRehypothecation>, decimals: u8) -> Result<()> {
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

    let face_value = ctx.accounts.trade_state.face_value;
    let bump = ctx.bumps.depository_authority;
    let seeds: &[&[u8]] = &[DEPOSITORY_AUTHORITY_SEED, &[bump]];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    let mut data = Vec::with_capacity(10);
    data.push(TRANSFER_CHECKED_DISCRIMINATOR);
    data.extend_from_slice(&face_value.to_le_bytes());
    data.push(decimals);

    let ix = Instruction {
        program_id: ctx.accounts.token_program.key(),
        accounts: vec![
            AccountMeta::new(ctx.accounts.seller_custodied_account.key(), false),
            AccountMeta::new_readonly(ctx.accounts.security_mint.key(), false),
            AccountMeta::new(ctx.accounts.buyer_use_account.key(), false),
            AccountMeta::new_readonly(ctx.accounts.depository_authority.key(), true),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            ctx.accounts.seller_custodied_account.to_account_info(),
            ctx.accounts.security_mint.to_account_info(),
            ctx.accounts.buyer_use_account.to_account_info(),
            ctx.accounts.depository_authority.to_account_info(),
        ],
        signer_seeds,
    )?;

    let trade_state = &mut ctx.accounts.trade_state;
    trade_state.buyer_use_account = ctx.accounts.buyer_use_account.key();
    trade_state.collateral_location = CollateralLocation::AtBuyerUse;

    Ok(())
}

#[derive(Accounts)]
pub struct ExerciseRehypothecation<'info> {
    /// The Depository's own ops key — authorizes this instruction on the
    /// Buyer's off-chain instruction (spec-001.md: "an off-chain
    /// instruction to the custodian"). Not the CPI signer; that's the PDA.
    pub depository_ops: Signer<'info>,
    #[account(mut)]
    pub trade_state: Account<'info, TradeState>,
    /// CHECK: PDA delegate; signs the CPI transfer via invoke_signed.
    #[account(seeds = [DEPOSITORY_AUTHORITY_SEED], bump)]
    pub depository_authority: UncheckedAccount<'info>,
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
