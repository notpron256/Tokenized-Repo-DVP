/**
 * Shared fixture builders for the local Depository test suite. Each
 * "seller custodied account" here is a fresh, plain (non-associated)
 * SPL Token account, not the singleton ATA scripts/create-security-mint.ts
 * uses for the real example trade — deliberate, so each test can get its
 * own independently-funded account rather than sharing one ATA per
 * (mint, owner) pair (which would make tests interfere with each
 * other's balances/pledges). The Depository program only ever treats
 * this account generically as a token account address, so the
 * substitution doesn't change what's being tested.
 */
import { Keypair, PublicKey, Signer, SystemProgram, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createAccount, createInitializeMintInstruction, getMinimumBalanceForRentExemptMint, mintTo, MINT_SIZE } from "@solana/spl-token";
import { buildOpenPledgeIx } from "./depository-instructions.js";
import { DEPOSITORY_PROGRAM_ID } from "./validator.js";
import { sendAndConfirmWithRetry, retryOnTransientBlockhashError } from "./send.js";
import type { Connection } from "@solana/web3.js";

export const TEST_DECIMALS = 2;

export async function createTestSecurityMint(connection: Connection, payer: Signer, mintAuthority: PublicKey): Promise<PublicKey> {
  const mint = Keypair.generate();
  const rent = await getMinimumBalanceForRentExemptMint(connection);
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports: rent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mint.publicKey, TEST_DECIMALS, mintAuthority, null, TOKEN_PROGRAM_ID),
  );
  await sendAndConfirmWithRetry(connection, tx, [payer, mint]);
  return mint.publicKey;
}

export async function createFundedTokenAccount(
  connection: Connection,
  payer: Signer,
  mint: PublicKey,
  owner: PublicKey,
  mintAuthority: Signer,
  amountRaw: bigint,
): Promise<PublicKey> {
  // createAccount/mintTo are @solana/spl-token's own high-level helpers,
  // each with an internal sendAndConfirmTransaction we have no way to
  // wrap directly with sendAndConfirmWithRetry — retry the whole call
  // instead (see retryOnTransientBlockhashError's own doc comment for
  // why this is safe specifically for these two calls).
  const account = await retryOnTransientBlockhashError(() =>
    createAccount(connection, payer, mint, owner, Keypair.generate(), undefined, TOKEN_PROGRAM_ID),
  );
  if (amountRaw > 0n) {
    await retryOnTransientBlockhashError(() =>
      mintTo(connection, payer, mint, account, mintAuthority, amountRaw, [], undefined, TOKEN_PROGRAM_ID),
    );
  }
  return account;
}

export interface OpenTestTradeOptions {
  connection: Connection;
  payer: Signer;
  depositoryOps: Signer;
  sellerCustodiedAccount: PublicKey;
  faceValueRaw: bigint;
  cashAmountRaw?: bigint;
  closeCashAmountRaw?: bigint;
  /** Wall-clock-relative offset — fine for tests using a large margin
   * (hours), where modest clock/wall-clock drift doesn't matter. */
  scheduledCloseOffsetSeconds?: number;
  /** Explicit, precise override for tests that need scheduled_close_unix
   * computed against the validator's own on-chain clock (see
   * helpers/clock.ts) rather than wall-clock time — required for a tight
   * grace-period boundary test, since the two clocks can drift under load. */
  scheduledCloseUnixOverride?: bigint;
  securityId?: string;
  rateBps?: number;
}

/** Opens a trade-state via open_pledge only (Depository-only — no bank
 * cash leg, matching Phase 3's original scoping). Returns the fresh
 * trade-state's address. */
export async function openTestTrade(opts: OpenTestTradeOptions): Promise<PublicKey> {
  const tradeState = Keypair.generate();
  const scheduledCloseUnix =
    opts.scheduledCloseUnixOverride ??
    BigInt(Math.floor(Date.now() / 1000) + (opts.scheduledCloseOffsetSeconds ?? 86400));
  const ix = buildOpenPledgeIx({
    programId: DEPOSITORY_PROGRAM_ID,
    depositoryOps: opts.depositoryOps.publicKey,
    tradeState: tradeState.publicKey,
    sellerCustodiedAccount: opts.sellerCustodiedAccount,
    securityId: opts.securityId ?? "TEST00001",
    faceValueRaw: opts.faceValueRaw,
    cashAmountRaw: opts.cashAmountRaw ?? opts.faceValueRaw,
    closeCashAmountRaw: opts.closeCashAmountRaw ?? opts.faceValueRaw,
    scheduledCloseUnix,
    rateBps: opts.rateBps ?? 365,
  });
  await sendAndConfirmWithRetry(opts.connection, new Transaction().add(ix), [opts.payer, opts.depositoryOps, tradeState]);
  return tradeState.publicKey;
}
