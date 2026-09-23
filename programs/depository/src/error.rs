use anchor_lang::prelude::*;

#[error_code]
pub enum DepositoryError {
    #[msg("security_id must be at most 9 characters")]
    SecurityIdTooLong,
}
