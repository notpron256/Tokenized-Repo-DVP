/**
 * Phase 2 (plan-001.md): creates the security-leg mint (base SPL Token,
 * not Token-2022 — spec-001.md's Token design deliberately avoids
 * Permanent Delegate here, see spec-001.md's Delegate-based right-of-use
 * mechanics) and mints the example trade's pledge face value directly
 * into a Depository-owned custodial token account.
 *
 * This custodial account stands in for "the Seller's Depository-custodied
 * token account" throughout spec-001.md's flows — it is an ATA owned by
 * the depository-ops authority itself, never by the Seller, per spec-
 * 001.md's Custody model ("the Seller is not the signing owner of the
 * custodied account; the Depository is").
 *
 * Fills plan-001.md's Ambiguity #2: spec-001.md's Open-leg flow assumes
 * this balance already exists before the pledge is granted; nothing in
 * spec.md specifies how it gets there. This script is that missing setup
 * step, run once per network before Phase 3+ can be exercised.
 *
 * Decimals = 2 (plan-001.md's Ambiguity #1 — unconfirmed assumption,
 * mirroring the bank's own cents convention for consistency).
 *
 * Idempotent per network: reuses an existing mint/custodial account if
 * keys/<network>/security-mint-address.json already points at one, and
 * only tops up the custodial balance if it's short of the target.
 */
import {
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getMint,
  getAccount,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
} from "@solana/spl-token";
import {
  getConnection,
  loadLocalKeypair,
  loadOrCreateDepositoryOpsKeypair,
  readPersistedSecurityMintAddress,
  persistSecurityMintAddress,
  DECIMALS,
  networkLabel,
} from "./lib/authorities.js";

// Example trade (spec-001.md, Example trade): $10,204,082 face value UST
// pledge, at 2 decimals -> integer raw units.
const FACE_VALUE_DOLLARS = 10_204_082;
const TARGET_RAW_AMOUNT = BigInt(FACE_VALUE_DOLLARS) * 100n;

async function main() {
  const connection = getConnection();
  const payer = loadLocalKeypair();
  const depositoryOps = await loadOrCreateDepositoryOpsKeypair(connection);

  console.log(`Network: ${networkLabel()}`);
  console.log(`Payer (fee/rent payer): ${payer.publicKey.toBase58()}`);
  console.log(`Depository-ops authority (security mint authority / custodian): ${depositoryOps.publicKey.toBase58()}`);

  const existingMint = readPersistedSecurityMintAddress();
  let mintPubkey;

  if (existingMint) {
    console.log();
    console.log(`Reusing existing security mint: ${existingMint.toBase58()}`);
    mintPubkey = existingMint;
  } else {
    const mint = Keypair.generate();
    const mintRent = await getMinimumBalanceForRentExemptMint(connection);

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mint.publicKey,
        DECIMALS,
        depositoryOps.publicKey, // mint authority
        null, // no freeze authority — base SPL Token, no compliance extensions on this leg
        TOKEN_PROGRAM_ID,
      ),
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [payer, mint]);
    console.log();
    console.log(`Security mint created: ${mint.publicKey.toBase58()}`);
    console.log(`Transaction: ${sig}`);
    persistSecurityMintAddress(mint.publicKey);
    console.log(`Saved to keys/${networkLabel()}/security-mint-address.json`);
    mintPubkey = mint.publicKey;
  }

  // Depository-owned custodial token account, standing in for "the
  // Seller's Depository-custodied token account" (spec-001.md, Delegate-
  // based right-of-use mechanics / Custody model).
  console.log();
  const custodialAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mintPubkey,
    depositoryOps.publicKey,
    false,
    "confirmed",
    undefined,
    TOKEN_PROGRAM_ID,
  );
  console.log(`Seller custodial account (Depository-owned): ${custodialAccount.address.toBase58()}`);

  const currentRaw = custodialAccount.amount;
  if (currentRaw >= TARGET_RAW_AMOUNT) {
    console.log(`Already funded: ${currentRaw.toString()} raw units >= target ${TARGET_RAW_AMOUNT.toString()}. Skipping mint.`);
  } else {
    const topUp = TARGET_RAW_AMOUNT - currentRaw;
    const sig = await mintTo(
      connection,
      payer,
      mintPubkey,
      custodialAccount.address,
      depositoryOps,
      topUp,
      [],
      undefined,
      TOKEN_PROGRAM_ID,
    );
    console.log(`Minted ${topUp.toString()} raw units (topping up to target). Transaction: ${sig}`);
  }

  // --- Read-back verification (on-chain state, not the instructions sent) ---
  console.log();
  console.log("--- Read-back verification ---");
  const mintInfo = await getMint(connection, mintPubkey, "confirmed", TOKEN_PROGRAM_ID);
  console.log(`Mint decimals: ${mintInfo.decimals} ${mintInfo.decimals === DECIMALS ? "(correct)" : "(WRONG)"}`);

  const accountInfo = await getAccount(connection, custodialAccount.address, "confirmed", TOKEN_PROGRAM_ID);
  const dollars = Number(accountInfo.amount) / 100;
  const balanceOk = accountInfo.amount === TARGET_RAW_AMOUNT;
  console.log(
    `Custodial account balance: ${accountInfo.amount.toString()} raw units ($${dollars.toLocaleString("en-US", { minimumFractionDigits: 2 })}) `
      + `${balanceOk ? "(matches target exactly, correct)" : "(does not match target — see above)"}`,
  );

  console.log();
  console.log(balanceOk ? "SECURITY MINT + CUSTODY FUNDING VERIFIED" : "SECURITY MINT + CUSTODY FUNDING FAILED VERIFICATION");
  console.log();
  console.log(`Run this to inspect independently: spl-token display ${custodialAccount.address.toBase58()} --url ${connection.rpcEndpoint}`);

  if (!balanceOk) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("SECURITY MINT CREATION FAILED");
  console.error(err);
  process.exit(1);
});
