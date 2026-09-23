//! Phase 1 (plan-001.md): workspace/program skeleton only. Real
//! instructions (open-leg pledge, rehypothecation exercise, close-leg
//! release, both default claims — see spec-001.md) land in later phases.
//! This phase exists solely to prove the workspace builds and deploys.

use anchor_lang::prelude::*;

declare_id!("8txdQqhWf2M4jvWa3kDugQThgu82Vw53QoZ8doNog9ah");

#[program]
pub mod depository {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
