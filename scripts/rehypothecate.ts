/**
 * Phase 5 (plan-001.md): exercises the Buyer's right of use mid-trade —
 * spec-001.md's Rehypothecation exercise flow. Creates a fresh, per-trade
 * Buyer's-use token account (a plain, non-associated SPL Token account —
 * deliberately not an ATA, since an ATA is a singleton per (owner, mint)
 * and the Depository already owns an ATA for this mint via the Seller's
 * custodied account), then calls the Depository program's
 * exercise_rehypothecation instruction, which does the real, spending
 * TransferChecked CPI and updates the trade-state's collateral-location
 * field.
 *
 * Usage: npx tsx scripts/rehypothecate.ts <TRADE_STATE_ADDRESS>
 */
import {
  Keypair,
  PublicKey,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createAccount } from "@solana/spl-token";
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
    console.error("Usage: npx tsx scripts/rehypothecate.ts <TRADE_STATE_ADDRESS>");
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

  const [depositoryAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("depository-authority")],
    DEPOSITORY_PROGRAM_ID,
  );

  // Read the trade-state to find the Seller's custodied account it
  // recorded at open (scripts/read-trade-state.ts decodes the same
  // layout; kept minimal here rather than importing that script's CLI).
  const info = await connection.getAccountInfo(tradeStateAddress, "confirmed");
  if (!info) {
    console.error(`No trade-state account found at ${tradeStateAddress.toBase58()}`);
    process.exit(1);
  }
  // security_id (string, 4-byte len prefix) + face_value(u64) + cash_amount(u64)
  // + close_cash_amount(u64) + scheduled_close_unix(i64) + rate_bps(u32)
  // + day_count(u8) + status(u8) + collateral_location(u8), then
  // seller_custodied_account(32 bytes).
  let offset = 8;
  const securityIdLen = info.data.readUInt32LE(offset);
  offset += 4 + securityIdLen;
  offset += 8 + 8 + 8 + 8 + 4 + 1 + 1 + 1; // face_value..collateral_location
  const sellerCustodiedAccount = new PublicKey(info.data.subarray(offset, offset + 32));

  console.log(`Trade-state: ${tradeStateAddress.toBase58()}`);
  console.log(`Seller custodied account (from trade-state): ${sellerCustodiedAccount.toBase58()}`);

  // --- Step 1: create the per-trade Buyer's-use account ---
  // A fresh Keypair is passed explicitly (not left undefined) so this
  // creates a genuinely new, plain (non-associated) token account —
  // createAccount() falls back to deriving/reusing the singleton ATA for
  // (owner, mint) when no keypair is given, which here would resolve to
  // the *same* address as the Seller's custodied account (Phase 2 already
  // created that ATA for this exact owner+mint pair).
  const buyerUseKeypair = Keypair.generate();
  const buyerUseAccount = await createAccount(
    connection,
    payer,
    securityMint,
    depositoryOps.publicKey,
    buyerUseKeypair,
    undefined,
    TOKEN_PROGRAM_ID,
  );
  console.log(`Buyer's-use account (created): ${buyerUseAccount.toBase58()}`);

  // --- Step 2: exercise_rehypothecation ---
  const data = Buffer.concat([
    anchorDiscriminator("global", "exercise_rehypothecation"),
    Buffer.from([DECIMALS]),
  ]);

  const ix = new TransactionInstruction({
    programId: DEPOSITORY_PROGRAM_ID,
    keys: [
      { pubkey: depositoryOps.publicKey, isSigner: true, isWritable: false },
      { pubkey: tradeStateAddress, isSigner: false, isWritable: true },
      { pubkey: depositoryAuthority, isSigner: false, isWritable: false },
      { pubkey: sellerCustodiedAccount, isSigner: false, isWritable: true },
      { pubkey: buyerUseAccount, isSigner: false, isWritable: true },
      { pubkey: securityMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer, depositoryOps]);
  console.log();
  console.log(`exercise_rehypothecation succeeded. Transaction: ${sig}`);
  console.log();
  console.log(`Verify collateral moved: spl-token display ${sellerCustodiedAccount.toBase58()} --url ${connection.rpcEndpoint}`);
  console.log(`Verify Buyer's-use account: spl-token display ${buyerUseAccount.toBase58()} --url ${connection.rpcEndpoint}`);
  console.log(`Verify trade-state: npx tsx scripts/read-trade-state.ts ${tradeStateAddress.toBase58()}`);
}

main().catch((err) => {
  console.error("REHYPOTHECATION EXERCISE FAILED");
  console.error(err);
  process.exit(1);
});
