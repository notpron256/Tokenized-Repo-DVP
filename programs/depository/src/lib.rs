//! Depository program (spec-001.md's new, minimal Rust/Anchor program —
//! see spec-001.md's Technical approach). Instructions land phase by
//! phase per plan-001.md; this file wires each phase's handler into the
//! program's public interface without duplicating its logic here.

use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("8txdQqhWf2M4jvWa3kDugQThgu82Vw53QoZ8doNog9ah");

#[program]
pub mod depository {
    use super::*;

    /// Phase 1 skeleton — kept as a cheap liveness check independent of
    /// any real instruction.
    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    /// Phase 3 (plan-001.md): open-leg pledge (Depository-only portion).
    /// See instructions::open_pledge::handler for the real logic.
    pub fn open_pledge(
        ctx: Context<OpenPledge>,
        security_id: String,
        face_value: u64,
        cash_amount: u64,
        close_cash_amount: u64,
        scheduled_close_unix: i64,
        rate_bps: u32,
    ) -> Result<()> {
        instructions::open_pledge::handler(
            ctx,
            security_id,
            face_value,
            cash_amount,
            close_cash_amount,
            scheduled_close_unix,
            rate_bps,
        )
    }

    /// Phase 5 (plan-001.md): rehypothecation exercise, mid-trade.
    /// See instructions::exercise_rehypothecation::handler.
    pub fn exercise_rehypothecation(ctx: Context<ExerciseRehypothecation>, decimals: u8) -> Result<()> {
        instructions::exercise_rehypothecation::handler(ctx, decimals)
    }
}

#[derive(Accounts)]
pub struct Initialize {}
