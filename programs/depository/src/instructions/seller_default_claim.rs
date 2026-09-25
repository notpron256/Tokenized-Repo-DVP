//! Seller-default claim (spec-001.md's Failure/unwind at close, Seller
//! default). Because the Buyer already holds an exercisable delegate
//! allowance over the pledged collateral (granted at open), this does
//! not require the Seller's cooperation — the Depository, on the
//! Buyer's off-chain instruction, unilaterally exercises it once the
//! grace-period deadline has passed. Mechanically identical to
//! exercise_rehypothecation's CPI (same invoke_signed TransferChecked
//! via the PDA delegate), gated on the deadline instead of being
//! unconditional, and terminal (TradeStatus::SellerDefaulted) instead
//! of leaving the trade Open.
//!
//! Requires collateral_location == AtSeller: if the Buyer already
//! exercised rehypothecation before the Seller defaulted, the Buyer
//! already holds the collateral in their own Buyer's-use account —
//! there is nothing left here to claim.
//!
//! Sets collateral_location to AtBuyerClaim, since the tokens have
//! genuinely moved to the claim account and leaving the prior value
//! (AtSeller) would be a false statement about where they are — see
//! state.rs's CollateralLocation doc comment for the reasoning.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;

use crate::constants::{DEPOSITORY_AUTHORITY_SEED, GRACE_PERIOD_SECONDS};
use crate::error::DepositoryError;
use crate::state::{CollateralLocation, TradeState, TradeStatus};

const TRANSFER_CHECKED_DISCRIMINATOR: u8 = 12;

pub fn handler(ctx: Context<SellerDefaultClaim>, decimals: u8) -> Result<()> {
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

        let now = Clock::get()?.unix_timestamp;
        let deadline = trade_state
            .scheduled_close_unix
            .checked_add(GRACE_PERIOD_SECONDS)
            .ok_or(DepositoryError::Overflow)?;
        require!(now >= deadline, DepositoryError::GracePeriodNotElapsed);
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
            AccountMeta::new(ctx.accounts.claim_account.key(), false),
            AccountMeta::new_readonly(ctx.accounts.depository_authority.key(), true),
        ],
        data,
    };

    invoke_signed(
        &ix,
        &[
            ctx.accounts.seller_custodied_account.to_account_info(),
            ctx.accounts.security_mint.to_account_info(),
            ctx.accounts.claim_account.to_account_info(),
            ctx.accounts.depository_authority.to_account_info(),
        ],
        signer_seeds,
    )?;

    let trade_state = &mut ctx.accounts.trade_state;
    trade_state.status = TradeStatus::SellerDefaulted;
    trade_state.collateral_location = CollateralLocation::AtBuyerClaim;

    Ok(())
}

#[derive(Accounts)]
pub struct SellerDefaultClaim<'info> {
    /// Authorizes this instruction on the Buyer's off-chain instruction
    /// (same authorization pattern as exercise_rehypothecation).
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
    pub claim_account: UncheckedAccount<'info>,
    /// CHECK: validated implicitly by the token program during the CPI
    pub security_mint: UncheckedAccount<'info>,
    /// CHECK: must be the SPL Token program; passed explicitly
    pub token_program: UncheckedAccount<'info>,
}
