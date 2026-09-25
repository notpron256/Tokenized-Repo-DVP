use anchor_lang::prelude::*;

#[error_code]
pub enum DepositoryError {
    #[msg("security_id must be at most 9 characters")]
    SecurityIdTooLong,
    #[msg("Trade is not open")]
    TradeNotOpen,
    #[msg("Collateral is not currently at the Seller's custodied account")]
    CollateralNotAtSeller,
    #[msg("Collateral is not currently at the Buyer's-use account")]
    CollateralNotAtBuyerUse,
    #[msg("Provided account does not match the trade-state's recorded account")]
    AccountMismatch,
}
