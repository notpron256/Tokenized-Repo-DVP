//! Open-leg pledge instruction (Depository-only portion — spec-001.md's
//! Open-leg flow step 3, and Delegate-based right-of-use mechanics).
//! Creates the trade-state account and CPIs into base SPL Token's
//! `Approve`, granting the Depository's program-controlled authority a
//! delegate allowance over the Seller's custodied position for exactly
//! the pledged face value.
//!
//! `depository_ops` signs directly here (it owns the custodial account,
//! per Phase 2's Custody model) — no PDA signing needed for `Approve`
//! itself, since the PDA is the delegate being approved, not the
//! invoker. This mirrors redemption-gateway's manual-CPI convention
//! (raw instruction bytes, not anchor_spl) rather than introducing a new
//! dependency for one instruction.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;

use crate::error::DepositoryError;
use crate::state::{CollateralLocation, DayCount, TradeState, TradeStatus};

/// Single, fixed, program-wide delegate authority — mirrors
/// redemption-gateway's GATEWAY_SEED pattern (spec-001.md's `Approve` is
/// scoped by the (owner, amount) pair per trade; the delegate address
/// itself doesn't need to vary per trade).
pub const DEPOSITORY_AUTHORITY_SEED: &[u8] = b"depository-authority";

/// Base SPL Token `Approve` instruction tag (TokenInstruction::Approve).
const APPROVE_DISCRIMINATOR: u8 = 4;

pub fn handler(
    ctx: Context<OpenPledge>,
    security_id: String,
    face_value: u64,
    cash_amount: u64,
    close_cash_amount: u64,
    scheduled_close_unix: i64,
    rate_bps: u32,
) -> Result<()> {
    require!(security_id.len() <= 9, DepositoryError::SecurityIdTooLong);

    let trade_state = &mut ctx.accounts.trade_state;
    trade_state.security_id = security_id;
    trade_state.face_value = face_value;
    trade_state.cash_amount = cash_amount;
    trade_state.close_cash_amount = close_cash_amount;
    trade_state.scheduled_close_unix = scheduled_close_unix;
    trade_state.rate_bps = rate_bps;
    trade_state.day_count = DayCount::Actual360;
    trade_state.status = TradeStatus::Open;
    trade_state.collateral_location = CollateralLocation::AtSeller;
    trade_state.seller_custodied_account = ctx.accounts.seller_custodied_account.key();
    trade_state.buyer_use_account = Pubkey::default();

    let mut data = Vec::with_capacity(9);
    data.push(APPROVE_DISCRIMINATOR);
    data.extend_from_slice(&face_value.to_le_bytes());

    let ix = Instruction {
        program_id: ctx.accounts.token_program.key(),
        accounts: vec![
            AccountMeta::new(ctx.accounts.seller_custodied_account.key(), false),
            AccountMeta::new_readonly(ctx.accounts.depository_authority.key(), false),
            AccountMeta::new_readonly(ctx.accounts.depository_ops.key(), true),
        ],
        data,
    };

    invoke(
        &ix,
        &[
            ctx.accounts.seller_custodied_account.to_account_info(),
            ctx.accounts.depository_authority.to_account_info(),
            ctx.accounts.depository_ops.to_account_info(),
        ],
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct OpenPledge<'info> {
    #[account(mut)]
    pub depository_ops: Signer<'info>,
    #[account(init, payer = depository_ops, space = 8 + TradeState::INIT_SPACE)]
    pub trade_state: Account<'info, TradeState>,
    /// CHECK: PDA used purely as the delegate authority address being
    /// approved; never signs here.
    #[account(seeds = [DEPOSITORY_AUTHORITY_SEED], bump)]
    pub depository_authority: UncheckedAccount<'info>,
    /// CHECK: validated implicitly by the token program during the CPI
    #[account(mut)]
    pub seller_custodied_account: UncheckedAccount<'info>,
    /// CHECK: must be the SPL Token program; passed explicitly rather
    /// than hardcoded so this program doesn't depend on a specific SDK
    /// macro pinning one program ID.
    pub token_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
