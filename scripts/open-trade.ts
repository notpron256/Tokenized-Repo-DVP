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

// Operational default for trades opened from here on (distinct from
// spec-001.md's documented $1,000,000 canonical Example trade, which
// stays as the historical record of what Phases 4-6 actually proved).
// Sized at $500k, well under half of the Seller's $2,000,000/hour
// velocity cap, specifically to leave real headroom for running several
// fresh trades in the same hour across later phases without hitting a
// window limit — see spec-001.md's Example trade section for the full
// history of why $10M and then $4M both failed on velocity grounds.
const SECURITY_ID = "912797FA9"; // placeholder CUSIP
const FACE_VALUE_RAW = 51_020_500n; // $510,205 @ 2 decimals (~2% haircut on $500,000)
const VALID_CASH_AMOUNT_RAW = 50_000_000n; // $500,000.00 @ 2 decimals
const NEGATIVE_TEST_CASH_AMOUNT_RAW = 1_000_000_000n; // $10,000,000.00 — the original, doubly-invalid figure; trips the bank's velocity cap by construction regardless of which party's tier applies
const CLOSE_CASH_AMOUNT_RAW = 50_005_069n; // $500,050.69 @ 2 decimals
const RATE_BPS = 365; // 3.65%

function memoInstruction(text: string): TransactionInstruction {
  return new TransactionInstruction({ programId: MEMO_PROGRAM_V3, keys: [], data: Buffer.from(text, "utf-8") });
}

async function main() {
  const negativeTest = process.argv.includes("--negative-test");

  // Optional overrides so a caller (e.g. Phase 9's e2e-full-lifecycle.ts)
  // can reproduce spec-001.md's exact documented $1,000,000 canonical
  // example precisely, distinct from this script's own $500k operational
  // default for casual future trades. Ignored when --negative-test is set
  // (that path always uses the fixed, deliberately-invalid figure).
  const argValue = (flag: string) => process.argv.find((a) => a.startsWith(`--${flag}=`))?.split("=")[1];
  const faceValueRaw = argValue("face-value-raw") ? BigInt(argValue("face-value-raw")!) : FACE_VALUE_RAW;
  const closeCashAmountRaw = argValue("close-cash-amount-raw") ? BigInt(argValue("close-cash-amount-raw")!) : CLOSE_CASH_AMOUNT_RAW;
  const validCashAmountRaw = argValue("cash-amount-raw") ? BigInt(argValue("cash-amount-raw")!) : VALID_CASH_AMOUNT_RAW;
  const cashAmountRaw = negativeTest ? NEGATIVE_TEST_CASH_AMOUNT_RAW : validCashAmountRaw;

  // Test-only override for Phase 7/8's default-path grace-period checks
  // (spec-001.md: scheduled close + 1 business day) — lets a fresh trade
  // be opened already past (or just short of) its deadline without
  // waiting real calendar time. Defaults to +86400 (a real overnight
  // term) when omitted.
  const scheduledCloseOffsetArg = process.argv.find((a) => a.startsWith("--scheduled-close-offset="));
  const scheduledCloseOffsetSeconds = scheduledCloseOffsetArg
    ? parseInt(scheduledCloseOffsetArg.split("=")[1], 10)
    : 86400;

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
    const scheduledCloseUnix = BigInt(Math.floor(Date.now() / 1000) + scheduledCloseOffsetSeconds);

    const openPledgeData = Buffer.concat([
      anchorDiscriminator("global", "open_pledge"),
      encodeString(SECURITY_ID),
      encodeU64(faceValueRaw),
      encodeU64(validCashAmountRaw), // trade-state always records the *intended* cash amount, even in the negative test
      encodeU64(closeCashAmountRaw),
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
