/**
 * Phase 7 (plan-001.md): Seller-default claim — spec-001.md's
 * Failure/unwind at close, Seller default. Unilaterally exercises the
 * Depository's delegate allowance against the Seller's custodied
 * position, moving the pledged collateral to a fresh claim account and
 * marking the trade Seller-defaulted — only once the grace-period
 * deadline (scheduled close + 1 business day) has passed.
 *
 * Usage: npx tsx scripts/seller-default-claim.ts <TRADE_STATE_ADDRESS>
 */
import { Keypair, PublicKey, TransactionInstruction, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
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
import { readTradeState } from "./lib/trade-state.js";

const GRACE_PERIOD_SECONDS = 86400;

async function main() {
  const tradeStateArg = process.argv[2];
  if (!tradeStateArg) {
    console.error("Usage: npx tsx scripts/seller-default-claim.ts <TRADE_STATE_ADDRESS>");
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

  const trade = await readTradeState(connection, tradeStateAddress);
  const [depositoryAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("depository-authority")],
    DEPOSITORY_PROGRAM_ID,
  );

  const now = Math.floor(Date.now() / 1000);
  const deadline = Number(trade.scheduledCloseUnix) + GRACE_PERIOD_SECONDS;
  console.log(`Trade-state: ${tradeStateAddress.toBase58()}`);
  console.log(`Scheduled close: ${new Date(Number(trade.scheduledCloseUnix) * 1000).toISOString()}`);
  console.log(`Grace-period deadline: ${new Date(deadline * 1000).toISOString()}`);
  console.log(`Now: ${new Date(now * 1000).toISOString()} — ${now >= deadline ? "PAST deadline, claim should succeed" : "BEFORE deadline, claim should be rejected"}`);

  const claimKeypair = Keypair.generate();
  const claimAccount = await createAccount(
    connection,
    payer,
    securityMint,
    depositoryOps.publicKey,
    claimKeypair,
    undefined,
    TOKEN_PROGRAM_ID,
  );
  console.log(`Claim account (created): ${claimAccount.toBase58()}`);

  const data = Buffer.concat([anchorDiscriminator("global", "seller_default_claim"), Buffer.from([DECIMALS])]);

  const ix = new TransactionInstruction({
    programId: DEPOSITORY_PROGRAM_ID,
    keys: [
      { pubkey: depositoryOps.publicKey, isSigner: true, isWritable: false },
      { pubkey: tradeStateAddress, isSigner: false, isWritable: true },
      { pubkey: depositoryAuthority, isSigner: false, isWritable: false },
      { pubkey: trade.sellerCustodiedAccount, isSigner: false, isWritable: true },
      { pubkey: claimAccount, isSigner: false, isWritable: true },
      { pubkey: securityMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer, depositoryOps]);
  console.log();
  console.log(`seller_default_claim succeeded. Transaction: ${sig}`);
  console.log();
  console.log(`Verify: spl-token display ${claimAccount.toBase58()} --url ${connection.rpcEndpoint}`);
  console.log(`Verify: npx tsx scripts/read-trade-state.ts ${tradeStateAddress.toBase58()}`);
}

main().catch((err) => {
  console.error("SELLER DEFAULT CLAIM FAILED (expected if attempted before the grace-period deadline)");
  console.error(err);
  process.exit(1);
});
