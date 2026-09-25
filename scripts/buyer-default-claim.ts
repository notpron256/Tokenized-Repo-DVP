/**
 * Phase 8 (plan-001.md): Buyer-default claim — spec-001.md's
 * Failure/unwind at close, Buyer default. Status-only trigger
 * (Ambiguity #4): marks the trade Buyer-defaulted once the grace-period
 * deadline has passed with collateral still sitting in the Buyer's-use
 * account (never returned), moving no funds. This script explicitly
 * reads the Buyer's-use account's balance before and after the claim to
 * prove that directly, not just assert it.
 *
 * Usage: npx tsx scripts/buyer-default-claim.ts <TRADE_STATE_ADDRESS>
 */
import { PublicKey, TransactionInstruction, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";
import { getConnection, loadLocalKeypair, loadOrCreateDepositoryOpsKeypair, DEPOSITORY_PROGRAM_ID } from "./lib/authorities.js";
import { anchorDiscriminator } from "./lib/borsh.js";
import { readTradeState, STATUS_LABELS, COLLATERAL_LOCATION_LABELS } from "./lib/trade-state.js";

const GRACE_PERIOD_SECONDS = 86400;

async function main() {
  const tradeStateArg = process.argv[2];
  if (!tradeStateArg) {
    console.error("Usage: npx tsx scripts/buyer-default-claim.ts <TRADE_STATE_ADDRESS>");
    process.exit(1);
  }
  const tradeStateAddress = new PublicKey(tradeStateArg);

  const connection = getConnection();
  const payer = loadLocalKeypair();
  const depositoryOps = await loadOrCreateDepositoryOpsKeypair(connection);

  const trade = await readTradeState(connection, tradeStateAddress);
  const now = Math.floor(Date.now() / 1000);
  const deadline = Number(trade.scheduledCloseUnix) + GRACE_PERIOD_SECONDS;

  console.log(`Trade-state: ${tradeStateAddress.toBase58()}`);
  console.log(`Status: ${STATUS_LABELS[trade.statusTag]}, Collateral location: ${COLLATERAL_LOCATION_LABELS[trade.collateralLocationTag]}`);
  console.log(`Grace-period deadline: ${new Date(deadline * 1000).toISOString()}`);
  console.log(`Now: ${new Date(now * 1000).toISOString()} — ${now >= deadline ? "PAST deadline, claim should succeed" : "BEFORE deadline, claim should be rejected"}`);

  const buyerUseAccountBefore = await getAccount(connection, trade.buyerUseAccount, "confirmed", TOKEN_PROGRAM_ID);
  console.log(`Buyer's-use account balance BEFORE: ${buyerUseAccountBefore.amount.toString()}`);

  const data = anchorDiscriminator("global", "buyer_default_claim");

  const ix = new TransactionInstruction({
    programId: DEPOSITORY_PROGRAM_ID,
    keys: [
      { pubkey: depositoryOps.publicKey, isSigner: true, isWritable: false },
      { pubkey: tradeStateAddress, isSigner: false, isWritable: true },
    ],
    data,
  });

  const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer, depositoryOps]);
  console.log();
  console.log(`buyer_default_claim succeeded. Transaction: ${sig}`);

  const buyerUseAccountAfter = await getAccount(connection, trade.buyerUseAccount, "confirmed", TOKEN_PROGRAM_ID);
  console.log(`Buyer's-use account balance AFTER: ${buyerUseAccountAfter.amount.toString()} ${
    buyerUseAccountAfter.amount === buyerUseAccountBefore.amount ? "(unchanged, as expected — no funds moved)" : "(CHANGED — unexpected!)"
  }`);
  console.log();
  console.log(`Verify: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  console.log(`Verify: npx tsx scripts/read-trade-state.ts ${tradeStateAddress.toBase58()}`);
}

main().catch((err) => {
  console.error("BUYER DEFAULT CLAIM FAILED (expected if attempted before the grace-period deadline, or if collateral was already returned)");
  console.error(err);
  process.exit(1);
});
