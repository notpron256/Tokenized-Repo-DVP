/**
 * Phase 4 (plan-001.md): the cross-institution atomic open-leg
 * transaction — the centerpiece of spec-001.md's whole design. One
 * Solana transaction, two sibling instructions:
 *   1. The bank's real, compliant cash-leg transfer (Buyer -> Seller),
 *      built by hand against tokenized-deposit-settlement's already-
 *      deployed devnet mint/compliance-hook — reused unmodified, not
 *      called via its HTTP API (which sends its own separate
 *      transaction; we need both legs in the SAME one).
 *   2. This repo's own open_pledge instruction (Phase 3).
 *
 * Runs against devnet only (plan-001.md's Structural decision) — that's
 * the only place the bank's real programs exist.
 *
 * The cash-leg signer is the Buyer's own bank-custodied keypair, read
 * read-only from tokenized-deposit-settlement's Postgres (see
 * scripts/lib/bank.ts and project-findings-and-working-notes.md's
 * Phase 4 entry for why this, not a bank operator authority, is
 * accurate to the reused system).
 *
 * Usage:
 *   npx tsx scripts/open-trade.ts               # happy path
 *   npx tsx scripts/open-trade.ts --negative-test # deliberately invalid
 *     cash amount ($10,000,000 — the pre-correction figure, guaranteed
 *     to trip the bank's own $5,000,000/hour velocity limit) alongside
 *     an otherwise entirely valid pledge leg, to demonstrate that the
 *     whole transaction reverts rather than partially applying.
 */
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  getConnection,
  loadLocalKeypair,
  loadOrCreateDepositoryOpsKeypair,
  readPersistedSecurityMintAddress,
  DEPOSITORY_PROGRAM_ID,
} from "./lib/authorities.js";
import { anchorDiscriminator, encodeString, encodeU64, encodeI64, encodeU32 } from "./lib/borsh.js";
import {
  BANK_MINT,
  BANK_DECIMALS,
  bankPool,
  loadBankClient,
  loadBankClientKeypair,
  recordSettledCashLegIfNeeded,
} from "./lib/bank.js";
import { identityHash } from "./lib/identity.js";
import { waitForFinalized } from "./lib/finality.js";

const MEMO_PROGRAM_V3 = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

// fixtures/devnet-accounts.md
const BUYER_CLIENT_ID = "22056748-4d61-4413-ac87-db38b012f427";
const SELLER_CLIENT_ID = "6e6be62e-48da-454b-8d7a-eb24844eb548";

// spec-001.md, Example trade (corrected, plan-001.md Phase 4).
const SECURITY_ID = "912797FA9"; // placeholder CUSIP
const FACE_VALUE_RAW = 408_163_300n; // $4,081,633 @ 2 decimals
const VALID_CASH_AMOUNT_RAW = 400_000_000n; // $4,000,000.00 @ 2 decimals
const NEGATIVE_TEST_CASH_AMOUNT_RAW = 1_000_000_000n; // $10,000,000.00 — the pre-correction figure; trips the bank's $5,000,000/hour velocity cap by construction
const CLOSE_CASH_AMOUNT_RAW = 400_040_556n; // $4,000,405.56 @ 2 decimals
const RATE_BPS = 365; // 3.65%

function memoInstruction(text: string): TransactionInstruction {
  return new TransactionInstruction({ programId: MEMO_PROGRAM_V3, keys: [], data: Buffer.from(text, "utf-8") });
}

async function main() {
  const negativeTest = process.argv.includes("--negative-test");
  const cashAmountRaw = negativeTest ? NEGATIVE_TEST_CASH_AMOUNT_RAW : VALID_CASH_AMOUNT_RAW;

  const connection = getConnection();
  if (!connection.rpcEndpoint.includes("devnet")) {
    console.error(`This script must run against devnet (SOLANA_RPC_URL is currently ${connection.rpcEndpoint}).`);
    process.exit(1);
  }

  const payer = loadLocalKeypair();
  const depositoryOps = await loadOrCreateDepositoryOpsKeypair(connection);
  const securityMint = readPersistedSecurityMintAddress();
  if (!securityMint) {
    console.error("No security mint found for devnet — run `SOLANA_RPC_URL=https://api.devnet.solana.com npx tsx scripts/create-security-mint.ts` first.");
    process.exit(1);
  }

  const pool = bankPool();
  let signature: string;
  try {
    const buyer = await loadBankClient(pool, BUYER_CLIENT_ID);
    const seller = await loadBankClient(pool, SELLER_CLIENT_ID);
    const buyerKeypair = await loadBankClientKeypair(pool, BUYER_CLIENT_ID);

    const buyerAta = new PublicKey(buyer.ata_address);
    const sellerAta = new PublicKey(seller.ata_address);

    const [depositoryAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("depository-authority")],
      DEPOSITORY_PROGRAM_ID,
    );
    const sellerCustodiedAccount = getAssociatedTokenAddressSync(
      securityMint,
      depositoryOps.publicKey,
      false,
      TOKEN_PROGRAM_ID,
    );

    console.log(`Mode: ${negativeTest ? "NEGATIVE TEST (deliberately invalid cash amount)" : "happy path"}`);
    console.log(`Buyer ATA (bank, cash leg): ${buyerAta.toBase58()}`);
    console.log(`Seller ATA (bank, cash leg): ${sellerAta.toBase58()}`);
    console.log(`Seller custodied account (Depository, security leg): ${sellerCustodiedAccount.toBase58()}`);
    console.log(`Cash amount requested: ${cashAmountRaw.toString()} raw ($${(Number(cashAmountRaw) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })})`);

    // --- Leg 1: the bank's real, compliant cash-leg transfer ---
    // Kept deliberately minimal: combining the bank's transfer (plus its
    // Transfer Hook's several resolved extra accounts) with this repo's
    // open_pledge instruction in one transaction leaves very little
    // headroom under Solana's ~1232-byte transaction size limit — the
    // fixed-format :50K:/:59: fields (a UUID + 64-char hash each) already
    // account for most of the memo's size and aren't reducible.
    const reference = `${Math.floor(Date.now() / 1000)}`;
    const ordering = `${buyer.id}:${identityHash(buyer)}`;
    const beneficiary = `${seller.id}:${identityHash(seller)}`;
    const memoText = `:20:${reference}|:50K:${ordering}|:59:${beneficiary}|:70:o`;

    const transferIx = await createTransferCheckedWithTransferHookInstruction(
      connection,
      buyerAta,
      BANK_MINT,
      sellerAta,
      buyerKeypair.publicKey,
      cashAmountRaw,
      BANK_DECIMALS,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    );

    // --- Leg 2: this repo's open_pledge instruction ---
    const tradeState = Keypair.generate();
    const scheduledCloseUnix = BigInt(Math.floor(Date.now() / 1000) + 86400);

    const openPledgeData = Buffer.concat([
      anchorDiscriminator("global", "open_pledge"),
      encodeString(SECURITY_ID),
      encodeU64(FACE_VALUE_RAW),
      encodeU64(VALID_CASH_AMOUNT_RAW), // trade-state always records the *intended* $4,000,000 cash amount, even in the negative test
      encodeU64(CLOSE_CASH_AMOUNT_RAW),
      encodeI64(scheduledCloseUnix),
      encodeU32(RATE_BPS),
    ]);

    const openPledgeIx = new TransactionInstruction({
      programId: DEPOSITORY_PROGRAM_ID,
      keys: [
        { pubkey: depositoryOps.publicKey, isSigner: true, isWritable: true },
        { pubkey: tradeState.publicKey, isSigner: true, isWritable: true },
        { pubkey: depositoryAuthority, isSigner: false, isWritable: false },
        { pubkey: sellerCustodiedAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: openPledgeData,
    });

    const tx = new Transaction().add(memoInstruction(memoText), transferIx, openPledgeIx);

    console.log();
    console.log("Submitting one transaction containing both sibling instructions (plus the required Travel Rule memo)...");
    signature = await sendAndConfirmTransaction(connection, tx, [payer, buyerKeypair, depositoryOps, tradeState], {
      commitment: "confirmed",
    });

    console.log();
    console.log(`TRANSACTION SUCCEEDED (confirmed): ${signature}`);
    console.log(`Trade-state address: ${tradeState.publicKey.toBase58()}`);

    // Bounded consistency window (see spec-001.md's Areas of concern and
    // project-findings-and-working-notes.md): the on-chain settlement is
    // already irreversible-pending-finalization at this point, but the
    // bank's own Postgres ledger — its stated "sole legal source of
    // truth" — knows nothing about this transfer yet, since we never
    // called its /transfers endpoint. Waiting for "finalized" (matching
    // the bank's own gating) before writing keeps this window as short
    // as the bank's own transferFlow.ts leaves it for an ordinary
    // transfer — not shorter, not longer.
    console.log();
    console.log("Waiting for finalized commitment before mirroring the bank's own ledger write...");
    await waitForFinalized(connection, signature, tx);
    const ledgerResult = await recordSettledCashLegIfNeeded(pool, {
      signature,
      senderClientId: BUYER_CLIENT_ID,
      recipientClientId: SELLER_CLIENT_ID,
      amountCents: cashAmountRaw,
    });
    console.log(`Bank ledger mirror (transfer_events + ledger_balances): ${ledgerResult}`);

    console.log();
    console.log("--- Read-back verification ---");
    const buyerAccount = await getAccount(connection, buyerAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    const sellerAccount = await getAccount(connection, sellerAta, "confirmed", TOKEN_2022_PROGRAM_ID);
    console.log(`Buyer ATA balance: ${buyerAccount.amount.toString()} raw ($${(Number(buyerAccount.amount) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })})`);
    console.log(`Seller ATA balance: ${sellerAccount.amount.toString()} raw ($${(Number(sellerAccount.amount) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })})`);
    console.log();
    console.log(`Verify independently: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    console.log(`Verify pledge: spl-token display ${sellerCustodiedAccount.toBase58()} --url ${connection.rpcEndpoint}`);
    console.log(`Verify trade-state: npx tsx scripts/read-trade-state.ts ${tradeState.publicKey.toBase58()}`);
  } catch (err) {
    console.log();
    console.log("TRANSACTION FAILED (this is the expected outcome for --negative-test)");
    console.error(err instanceof Error ? err.message : err);
    if (!negativeTest) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main();
