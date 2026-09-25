/**
 * Phase 6 (plan-001.md): returns rehypothecated collateral from the
 * Buyer's-use account back to the Seller's custodied account — fills
 * Ambiguity #3 (spec.md never names this instruction). Required before
 * close-trade.ts can run on a trade that exercised rehypothecation
 * (Phase 5); a no-op path for a trade that never did.
 *
 * Usage: npx tsx scripts/return-collateral.ts <TRADE_STATE_ADDRESS>
 */
import { PublicKey, TransactionInstruction, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  getConnection,
  loadLocalKeypair,
  loadOrCreateDepositoryOpsKeypair,
  readPersistedSecurityMintAddress,
  DEPOSITORY_PROGRAM_ID,
  DECIMALS,
} from "./lib/authorities.js";
import { anchorDiscriminator } from "./lib/borsh.js";

async function main() {
  const tradeStateArg = process.argv[2];
  if (!tradeStateArg) {
    console.error("Usage: npx tsx scripts/return-collateral.ts <TRADE_STATE_ADDRESS>");
    process.exit(1);
  }
  const tradeStateAddress = new PublicKey(tradeStateArg);

  const connection = getConnection();
  const payer = loadLocalKeypair();
  const depositoryOps = await loadOrCreateDepositoryOpsKeypair(connection);
  const securityMint = readPersistedSecurityMintAddress();
  if (!securityMint) {
    console.error("No security mint found — run create-security-mint.ts first.");
    process.exit(1);
  }

  const info = await connection.getAccountInfo(tradeStateAddress, "confirmed");
  if (!info) {
    console.error(`No trade-state account found at ${tradeStateAddress.toBase58()}`);
    process.exit(1);
  }
  let offset = 8;
  const securityIdLen = info.data.readUInt32LE(offset);
  offset += 4 + securityIdLen;
  offset += 8 + 8 + 8 + 8 + 4 + 1 + 1 + 1; // face_value..collateral_location
  const sellerCustodiedAccount = new PublicKey(info.data.subarray(offset, offset + 32));
  offset += 32;
  const buyerUseAccount = new PublicKey(info.data.subarray(offset, offset + 32));

  console.log(`Trade-state: ${tradeStateAddress.toBase58()}`);
  console.log(`Seller custodied account: ${sellerCustodiedAccount.toBase58()}`);
  console.log(`Buyer's-use account: ${buyerUseAccount.toBase58()}`);

  const data = Buffer.concat([anchorDiscriminator("global", "return_rehypothecated"), Buffer.from([DECIMALS])]);

  const ix = new TransactionInstruction({
    programId: DEPOSITORY_PROGRAM_ID,
    keys: [
      { pubkey: depositoryOps.publicKey, isSigner: true, isWritable: true },
      { pubkey: tradeStateAddress, isSigner: false, isWritable: true },
      { pubkey: sellerCustodiedAccount, isSigner: false, isWritable: true },
      { pubkey: buyerUseAccount, isSigner: false, isWritable: true },
      { pubkey: securityMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer, depositoryOps]);
  console.log();
  console.log(`return_rehypothecated succeeded. Transaction: ${sig}`);
  console.log();
  console.log(`Verify: spl-token display ${sellerCustodiedAccount.toBase58()} --url ${connection.rpcEndpoint}`);
  console.log(`Verify: npx tsx scripts/read-trade-state.ts ${tradeStateAddress.toBase58()}`);
}

main().catch((err) => {
  console.error("RETURN COLLATERAL FAILED");
  console.error(err);
  process.exit(1);
});
