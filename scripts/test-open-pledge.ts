/**
 * Phase 3 (plan-001.md): invokes the depository program's open_pledge
 * instruction in isolation (Depository-only — no bank/cash leg yet,
 * that's Phase 4's cross-institution atomic transaction). Exercises the
 * exact example trade numbers from spec-001.md's Example trade section.
 */
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  getConnection,
  loadLocalKeypair,
  loadOrCreateDepositoryOpsKeypair,
  readPersistedSecurityMintAddress,
  DEPOSITORY_PROGRAM_ID,
} from "./lib/authorities.js";
import { anchorDiscriminator, encodeString, encodeU64, encodeI64, encodeU32 } from "./lib/borsh.js";

// spec-001.md, Example trade.
const SECURITY_ID = "912797FA9"; // placeholder CUSIP
const FACE_VALUE_RAW = 1_020_408_200n; // $10,204,082.00 @ 2 decimals
const CASH_AMOUNT_RAW = 1_000_000_000n; // $10,000,000.00 @ 2 decimals
const CLOSE_CASH_AMOUNT_RAW = 1_000_101_389n; // $10,001,013.89 @ 2 decimals
const RATE_BPS = 365; // 3.65%

async function main() {
  const sellerCustodialAccountArg = process.argv[2];
  if (!sellerCustodialAccountArg) {
    console.error("Usage: npx tsx scripts/test-open-pledge.ts <SELLER_CUSTODIAL_ACCOUNT>");
    process.exit(1);
  }
  const sellerCustodiedAccount = new PublicKey(sellerCustodialAccountArg);

  const connection = getConnection();
  const payer = loadLocalKeypair();
  const depositoryOps = await loadOrCreateDepositoryOpsKeypair(connection);
  const securityMint = readPersistedSecurityMintAddress();
  if (!securityMint) {
    console.error("No security mint found — run `npm run create-security-mint` first.");
    process.exit(1);
  }

  const [depositoryAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("depository-authority")],
    DEPOSITORY_PROGRAM_ID,
  );

  const tradeState = Keypair.generate();
  const scheduledCloseUnix = BigInt(Math.floor(Date.now() / 1000) + 86400); // +1 business day, for this isolated test

  console.log(`Depository-ops authority: ${depositoryOps.publicKey.toBase58()}`);
  console.log(`Depository authority PDA (delegate): ${depositoryAuthority.toBase58()}`);
  console.log(`Trade-state account (new): ${tradeState.publicKey.toBase58()}`);
  console.log(`Seller custodied account: ${sellerCustodiedAccount.toBase58()}`);

  const data = Buffer.concat([
    anchorDiscriminator("global", "open_pledge"),
    encodeString(SECURITY_ID),
    encodeU64(FACE_VALUE_RAW),
    encodeU64(CASH_AMOUNT_RAW),
    encodeU64(CLOSE_CASH_AMOUNT_RAW),
    encodeI64(scheduledCloseUnix),
    encodeU32(RATE_BPS),
  ]);

  const ix = new TransactionInstruction({
    programId: DEPOSITORY_PROGRAM_ID,
    keys: [
      { pubkey: depositoryOps.publicKey, isSigner: true, isWritable: true },
      { pubkey: tradeState.publicKey, isSigner: true, isWritable: true },
      { pubkey: depositoryAuthority, isSigner: false, isWritable: false },
      { pubkey: sellerCustodiedAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const sig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(ix),
    [payer, depositoryOps, tradeState],
  );

  console.log();
  console.log(`open_pledge succeeded. Transaction: ${sig}`);
  console.log(`Trade-state address (save this): ${tradeState.publicKey.toBase58()}`);
  console.log();
  console.log(`Verify with: npx tsx scripts/read-trade-state.ts ${tradeState.publicKey.toBase58()}`);
  console.log(`Verify delegate with: spl-token display ${sellerCustodiedAccount.toBase58()} --url ${connection.rpcEndpoint}`);
}

main().catch((err) => {
  console.error("OPEN PLEDGE TEST FAILED");
  console.error(err);
  process.exit(1);
});
