/**
 * Phase 6 (plan-001.md): the atomic close-leg transaction — spec-001.md's
 * Close-leg flow (happy path). One Solana transaction, two sibling
 * instructions: the bank's real cash-plus-interest transfer (Seller ->
 * Buyer, closing the loan) and this repo's release_pledge instruction.
 * Mirrors scripts/open-trade.ts's structure and reasoning exactly,
 * mechanically reversed (Seller signs the cash leg this time — Seller is
 * the one repaying).
 *
 * Requires collateral_location == AtSeller — for a trade that exercised
 * rehypothecation (Phase 5), run scripts/return-collateral.ts first.
 *
 * Usage: npx tsx scripts/close-trade.ts <TRADE_STATE_ADDRESS>
 */
import { PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createTransferCheckedWithTransferHookInstruction, getAccount } from "@solana/spl-token";
import { getConnection, loadLocalKeypair, loadOrCreateDepositoryOpsKeypair, DEPOSITORY_PROGRAM_ID } from "./lib/authorities.js";
import { anchorDiscriminator } from "./lib/borsh.js";
import { BANK_MINT, BANK_DECIMALS, bankPool, loadBankClient, loadBankClientKeypair, recordSettledCashLegIfNeeded } from "./lib/bank.js";
import { identityHash } from "./lib/identity.js";
import { waitForFinalized } from "./lib/finality.js";
import { readTradeState, STATUS_LABELS, COLLATERAL_LOCATION_LABELS } from "./lib/trade-state.js";

const MEMO_PROGRAM_V3 = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// fixtures/devnet-accounts.md
const BUYER_CLIENT_ID = "22056748-4d61-4413-ac87-db38b012f427";
const SELLER_CLIENT_ID = "6e6be62e-48da-454b-8d7a-eb24844eb548";

function memoInstruction(text: string): TransactionInstruction {
  return new TransactionInstruction({ programId: MEMO_PROGRAM_V3, keys: [], data: Buffer.from(text, "utf-8") });
}

async function main() {
  const tradeStateArg = process.argv[2];
  if (!tradeStateArg) {
    console.error("Usage: npx tsx scripts/close-trade.ts <TRADE_STATE_ADDRESS>");
    process.exit(1);
  }
  const tradeStateAddress = new PublicKey(tradeStateArg);

  const connection = getConnection();
  if (!connection.rpcEndpoint.includes("devnet")) {
    console.error(`This script must run against devnet (SOLANA_RPC_URL is currently ${connection.rpcEndpoint}).`);
    process.exit(1);
  }
  const payer = loadLocalKeypair();
  const depositoryOps = await loadOrCreateDepositoryOpsKeypair(connection);

  const trade = await readTradeState(connection, tradeStateAddress);
  console.log(`Trade-state: ${tradeStateAddress.toBase58()}`);
  console.log(`Status: ${STATUS_LABELS[trade.statusTag]}, Collateral location: ${COLLATERAL_LOCATION_LABELS[trade.collateralLocationTag]}`);
  console.log(`Close cash amount: $${(Number(trade.closeCashAmount) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`);

  if (trade.collateralLocationTag !== 0) {
    console.error("Collateral is not at the Seller — run scripts/return-collateral.ts first.");
    process.exit(1);
  }

  const pool = bankPool();
  try {
    const seller = await loadBankClient(pool, SELLER_CLIENT_ID);
    const buyer = await loadBankClient(pool, BUYER_CLIENT_ID);
    const sellerKeypair = await loadBankClientKeypair(pool, SELLER_CLIENT_ID);

    const sellerAta = new PublicKey(seller.ata_address);
    const buyerAta = new PublicKey(buyer.ata_address);

    const reference = `${Math.floor(Date.now() / 1000)}`;
    const ordering = `${seller.id}:${identityHash(seller)}`;
    const beneficiary = `${buyer.id}:${identityHash(buyer)}`;
    const memoText = `:20:${reference}|:50K:${ordering}|:59:${beneficiary}|:70:c`;

    const transferIx = await createTransferCheckedWithTransferHookInstruction(
      connection,
      sellerAta,
      BANK_MINT,
      buyerAta,
      sellerKeypair.publicKey,
      trade.closeCashAmount,
      BANK_DECIMALS,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );

    const releasePledgeIx = new TransactionInstruction({
      programId: DEPOSITORY_PROGRAM_ID,
      keys: [
        { pubkey: depositoryOps.publicKey, isSigner: true, isWritable: false },
        { pubkey: tradeStateAddress, isSigner: false, isWritable: true },
        { pubkey: trade.sellerCustodiedAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: anchorDiscriminator("global", "release_pledge"),
    });

    const tx = new Transaction().add(memoInstruction(memoText), transferIx, releasePledgeIx);

    console.log();
    console.log("Submitting one transaction containing both sibling instructions...");
    const signature = await sendAndConfirmTransaction(connection, tx, [payer, sellerKeypair, depositoryOps], {
      commitment: "confirmed",
    });
    console.log(`TRANSACTION SUCCEEDED (confirmed): ${signature}`);

    console.log();
    console.log("Waiting for finalized commitment before mirroring the bank's own ledger write...");
    await waitForFinalized(connection, signature, tx);
    const ledgerResult = await recordSettledCashLegIfNeeded(pool, {
      signature,
      senderClientId: SELLER_CLIENT_ID,
      recipientClientId: BUYER_CLIENT_ID,
      amountCents: trade.closeCashAmount,
    });
    console.log(`Bank ledger mirror: ${ledgerResult}`);

    console.log();
    console.log("--- Read-back verification ---");
    const sellerAccount = await getAccount(connection, sellerAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    const buyerAccount = await getAccount(connection, buyerAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    console.log(`Seller ATA balance: $${(Number(sellerAccount.amount) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    console.log(`Buyer ATA balance: $${(Number(buyerAccount.amount) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    console.log();
    console.log(`Verify independently: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    console.log(`Verify pledge released: spl-token display ${trade.sellerCustodiedAccount.toBase58()} --url ${connection.rpcEndpoint}`);
    console.log(`Verify trade-state: npx tsx scripts/read-trade-state.ts ${tradeStateAddress.toBase58()}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("CLOSE TRADE FAILED");
  console.error(err);
  process.exit(1);
});
