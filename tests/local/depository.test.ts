/**
 * Module 4 (Test): automated coverage for the Depository program's core
 * logic (Phases 1-3, 5, 7-8) against a dedicated ephemeral local
 * validator — never devnet, since none of this depends on the bank's
 * reused system and shouldn't be subject to devnet's real velocity caps
 * or general flakiness (plan-001.md's Structural decision already
 * scoped Phases 1-3 as Depository-only/local-testable for the same
 * reason; this extends that same boundary to 5, 7, and 8).
 *
 * Each `describe` block gets its own fresh seller-custodied account and
 * trade-state, so tests never share or mutate each other's balances.
 *
 * Run: anchor build && npx tsx --test tests/local/depository.test.ts
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { Keypair, Transaction, type Connection } from "@solana/web3.js";
import { sendAndConfirmWithRetry } from "./helpers/send.js";
import { getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { startEphemeralValidator, stopEphemeralValidator, DEPOSITORY_PROGRAM_ID } from "./helpers/validator.js";
import { createTestSecurityMint, createFundedTokenAccount, openTestTrade, TEST_DECIMALS } from "./helpers/fixtures.js";
import {
  buildExerciseRehypothecationIx,
  buildReturnRehypothecatedIx,
  buildReleasePledgeIx,
  buildSellerDefaultClaimIx,
  buildBuyerDefaultClaimIx,
  findDepositoryAuthority,
} from "./helpers/depository-instructions.js";
import { readTradeState, STATUS_LABELS, COLLATERAL_LOCATION_LABELS } from "../../scripts/lib/trade-state.js";
import { getOnChainUnixTimestamp, waitForOnChainTime } from "./helpers/clock.js";

const FACE_VALUE = 1_000_000n; // $10,000.00 @ 2 decimals — arbitrary, small, test-only

let connection: Connection;
let payer: Keypair;
let depositoryOps: Keypair;
let securityMint: import("@solana/web3.js").PublicKey;

async function airdrop(pubkey: import("@solana/web3.js").PublicKey, sol: number): Promise<void> {
  const sig = await connection.requestAirdrop(pubkey, sol * 1_000_000_000);
  await connection.confirmTransaction(sig, "confirmed");
}

async function expectAnchorError(promise: Promise<unknown>, errorCode: string): Promise<void> {
  // Bug found by mutation testing (Module 4): assert.fail() called *inside*
  // this same try block was caught by the catch right below it, and its own
  // message ("Expected transaction to fail with <errorCode>, but it
  // succeeded") always contains the errorCode substring being searched for
  // — so a transaction that wrongly *succeeded* was silently reported as a
  // pass. The fail-on-success path must throw from outside the try/catch.
  let succeeded = false;
  try {
    await promise;
    succeeded = true;
  } catch (err: unknown) {
    const e = err as { transactionLogs?: string[]; message?: string };
    const joined = [...(e.transactionLogs ?? []), e.message ?? ""].join("\n");
    assert.ok(joined.includes(errorCode), `Expected error containing "${errorCode}", got:\n${joined}`);
    return;
  }
  if (succeeded) {
    assert.fail(`Expected transaction to fail with ${errorCode}, but it succeeded`);
  }
}

async function freshSellerAccount(amount: bigint): Promise<import("@solana/web3.js").PublicKey> {
  return createFundedTokenAccount(connection, payer, securityMint, depositoryOps.publicKey, depositoryOps, amount);
}

async function freshBuyerUseAccount(): Promise<import("@solana/web3.js").PublicKey> {
  return createFundedTokenAccount(connection, payer, securityMint, depositoryOps.publicKey, depositoryOps, 0n);
}

before(async () => {
  connection = await startEphemeralValidator();
  payer = Keypair.generate();
  depositoryOps = Keypair.generate();
  await airdrop(payer.publicKey, 10);
  await airdrop(depositoryOps.publicKey, 10);
  securityMint = await createTestSecurityMint(connection, payer, depositoryOps.publicKey);
});

after(() => {
  stopEphemeralValidator();
});

describe("open_pledge", () => {
  test("creates a trade-state and approves exactly the face value to the Depository PDA", async () => {
    const sellerAccount = await freshSellerAccount(FACE_VALUE);
    const tradeState = await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseOffsetSeconds: 86400,
    });

    const trade = await readTradeState(connection, tradeState);
    assert.equal(STATUS_LABELS[trade.statusTag], "Open");
    assert.equal(COLLATERAL_LOCATION_LABELS[trade.collateralLocationTag], "AtSeller");
    assert.equal(trade.faceValue, FACE_VALUE);

    const [depositoryAuthority] = findDepositoryAuthority(DEPOSITORY_PROGRAM_ID);
    const account = await getAccount(connection, sellerAccount, "confirmed", TOKEN_PROGRAM_ID);
    assert.ok(account.delegate?.equals(depositoryAuthority), "delegate should be the Depository PDA");
    assert.equal(account.delegatedAmount, FACE_VALUE);
  });

  test("rejects a second open_pledge against an already-pledged custodied account, and leaves the first trade's delegate untouched", async () => {
    const sellerAccount = await freshSellerAccount(FACE_VALUE);
    await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseOffsetSeconds: 86400,
    });

    // Confirm a real delegate is genuinely set — read independently via
    // the trusted @solana/spl-token library, not via the program's own
    // guard logic. If the guard's manual byte offset were wrong, this
    // assertion (not the guard) is what would prove the delegate really
    // is there, so the guard's later failure to reject would be visibly
    // a guard bug, not ambiguous with "maybe there was never a delegate."
    const [depositoryAuthority] = findDepositoryAuthority(DEPOSITORY_PROGRAM_ID);
    const beforeSecondAttempt = await getAccount(connection, sellerAccount, "confirmed", TOKEN_PROGRAM_ID);
    assert.ok(beforeSecondAttempt.delegate?.equals(depositoryAuthority), "a real delegate must be set after the first open_pledge");
    assert.equal(beforeSecondAttempt.delegatedAmount, FACE_VALUE);

    await expectAnchorError(
      openTestTrade({
        connection,
        payer,
        depositoryOps,
        sellerCustodiedAccount: sellerAccount,
        faceValueRaw: FACE_VALUE,
        scheduledCloseOffsetSeconds: 86400,
      }),
      "AccountAlreadyPledged",
    );

    // The rejected second call must not have even partially clobbered
    // the first trade's live allowance.
    const afterSecondAttempt = await getAccount(connection, sellerAccount, "confirmed", TOKEN_PROGRAM_ID);
    assert.ok(afterSecondAttempt.delegate?.equals(depositoryAuthority));
    assert.equal(afterSecondAttempt.delegatedAmount, FACE_VALUE);
  });
});

describe("exercise_rehypothecation", () => {
  test("regression: moves the exact face value via a real TransferChecked (not ApproveChecked) — Phase 5's discriminator bug would fail this outright", async () => {
    const sellerAccount = await freshSellerAccount(FACE_VALUE);
    const buyerUseAccount = await freshBuyerUseAccount();
    const tradeState = await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseOffsetSeconds: 86400,
    });

    const sellerBefore = await getAccount(connection, sellerAccount, "confirmed", TOKEN_PROGRAM_ID);
    const buyerBefore = await getAccount(connection, buyerUseAccount, "confirmed", TOKEN_PROGRAM_ID);

    const ix = buildExerciseRehypothecationIx(
      DEPOSITORY_PROGRAM_ID,
      depositoryOps.publicKey,
      tradeState,
      sellerAccount,
      buyerUseAccount,
      securityMint,
      TEST_DECIMALS,
    );
    await sendAndConfirmWithRetry(connection, new Transaction().add(ix), [payer, depositoryOps]);

    const sellerAfter = await getAccount(connection, sellerAccount, "confirmed", TOKEN_PROGRAM_ID);
    const buyerAfter = await getAccount(connection, buyerUseAccount, "confirmed", TOKEN_PROGRAM_ID);

    // The actual regression assertion: real balances moved by exactly
    // FACE_VALUE. An ApproveChecked mixup would either fail outright
    // (as it did in Phase 5) or, if it somehow succeeded, would leave
    // both balances completely unchanged — either way this fails loudly.
    assert.equal(sellerAfter.amount, sellerBefore.amount - FACE_VALUE);
    assert.equal(buyerAfter.amount, buyerBefore.amount + FACE_VALUE);
    assert.equal(sellerAfter.delegate, null, "delegate should auto-clear once fully spent");

    const trade = await readTradeState(connection, tradeState);
    assert.equal(COLLATERAL_LOCATION_LABELS[trade.collateralLocationTag], "AtBuyerUse");
    assert.ok(trade.buyerUseAccount.equals(buyerUseAccount));
  });

  test("rejects a second exercise once collateral is already AtBuyerUse", async () => {
    const sellerAccount = await freshSellerAccount(FACE_VALUE);
    const buyerUseAccount = await freshBuyerUseAccount();
    const tradeState = await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseOffsetSeconds: 86400,
    });
    const ix = buildExerciseRehypothecationIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState, sellerAccount, buyerUseAccount, securityMint, TEST_DECIMALS);
    await sendAndConfirmWithRetry(connection, new Transaction().add(ix), [payer, depositoryOps]);

    const secondBuyerUseAccount = await freshBuyerUseAccount();
    const ix2 = buildExerciseRehypothecationIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState, sellerAccount, secondBuyerUseAccount, securityMint, TEST_DECIMALS);
    await expectAnchorError(
      sendAndConfirmWithRetry(connection, new Transaction().add(ix2), [payer, depositoryOps]),
      "CollateralNotAtSeller",
    );
  });

  // Added by mutation testing (Module 4): removing the status == Open
  // check entirely still passed every other test here, since every other
  // path away from Open in this program's current instruction set also
  // moves collateral_location away from AtSeller in the same step (so the
  // AtSeller check alone happens to catch those). But seller_custodied_account
  // isn't scoped to one trade — nothing stops the same physical account
  // being reused for a second, later trade after the first one closes,
  // which re-approves a live delegate on it. Without the status check,
  // calling exercise_rehypothecation against the first (Closed) trade's
  // stale trade-state — while a genuinely live delegate exists on the
  // account, from the second trade's own open_pledge — would incorrectly
  // succeed and corrupt the closed trade's own recorded state.
  test("rejects exercise against a Closed trade's stale trade-state, even when the seller account currently has a live delegate from a later trade", async () => {
    const sellerAccount = await freshSellerAccount(FACE_VALUE);
    const closedTradeState = await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseOffsetSeconds: 86400,
    });
    await sendAndConfirmWithRetry(
      connection,
      new Transaction().add(buildReleasePledgeIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, closedTradeState, sellerAccount)),
      [payer, depositoryOps],
    );

    // Reuse the same physical account for a second, later trade — its
    // balance is untouched by release_pledge (only the delegate was
    // revoked), so re-approving the same amount again is legitimate.
    await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseOffsetSeconds: 86400,
    });

    const buyerUseAccount = await freshBuyerUseAccount();
    await expectAnchorError(
      sendAndConfirmWithRetry(
        connection,
        new Transaction().add(
          buildExerciseRehypothecationIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, closedTradeState, sellerAccount, buyerUseAccount, securityMint, TEST_DECIMALS),
        ),
        [payer, depositoryOps],
      ),
      "TradeNotOpen",
    );
  });
});

describe("return_rehypothecated", () => {
  test("moves collateral back to the seller and sets collateral_location to AtSeller", async () => {
    const sellerAccount = await freshSellerAccount(FACE_VALUE);
    const buyerUseAccount = await freshBuyerUseAccount();
    const tradeState = await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseOffsetSeconds: 86400,
    });
    await sendAndConfirmWithRetry(
      connection,
      new Transaction().add(buildExerciseRehypothecationIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState, sellerAccount, buyerUseAccount, securityMint, TEST_DECIMALS)),
      [payer, depositoryOps],
    );

    await sendAndConfirmWithRetry(
      connection,
      new Transaction().add(buildReturnRehypothecatedIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState, sellerAccount, buyerUseAccount, securityMint, TEST_DECIMALS)),
      [payer, depositoryOps],
    );

    const sellerAfter = await getAccount(connection, sellerAccount, "confirmed", TOKEN_PROGRAM_ID);
    const buyerAfter = await getAccount(connection, buyerUseAccount, "confirmed", TOKEN_PROGRAM_ID);
    assert.equal(sellerAfter.amount, FACE_VALUE);
    assert.equal(buyerAfter.amount, 0n);

    const trade = await readTradeState(connection, tradeState);
    assert.equal(COLLATERAL_LOCATION_LABELS[trade.collateralLocationTag], "AtSeller");
  });
});

describe("release_pledge", () => {
  test("revokes the delegate and marks the trade Closed", async () => {
    const sellerAccount = await freshSellerAccount(FACE_VALUE);
    const tradeState = await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseOffsetSeconds: 86400,
    });

    await sendAndConfirmWithRetry(
      connection,
      new Transaction().add(buildReleasePledgeIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState, sellerAccount)),
      [payer, depositoryOps],
    );

    const account = await getAccount(connection, sellerAccount, "confirmed", TOKEN_PROGRAM_ID);
    assert.equal(account.delegate, null);
    const trade = await readTradeState(connection, tradeState);
    assert.equal(STATUS_LABELS[trade.statusTag], "Closed");
  });

  test("rejects release while collateral is AtBuyerUse", async () => {
    const sellerAccount = await freshSellerAccount(FACE_VALUE);
    const buyerUseAccount = await freshBuyerUseAccount();
    const tradeState = await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseOffsetSeconds: 86400,
    });
    await sendAndConfirmWithRetry(
      connection,
      new Transaction().add(buildExerciseRehypothecationIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState, sellerAccount, buyerUseAccount, securityMint, TEST_DECIMALS)),
      [payer, depositoryOps],
    );
    await expectAnchorError(
      sendAndConfirmWithRetry(connection, new Transaction().add(buildReleasePledgeIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState, sellerAccount)), [payer, depositoryOps]),
      "CollateralNotAtSeller",
    );
  });
});

describe("seller_default_claim", () => {
  test("rejects before the grace-period deadline", async () => {
    const sellerAccount = await freshSellerAccount(FACE_VALUE);
    const tradeState = await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseOffsetSeconds: -3600, // deadline ~23h away
    });
    const claimAccount = await freshBuyerUseAccount();
    await expectAnchorError(
      sendAndConfirmWithRetry(
        connection,
        new Transaction().add(buildSellerDefaultClaimIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState, sellerAccount, claimAccount, securityMint, TEST_DECIMALS)),
        [payer, depositoryOps],
      ),
      "GracePeriodNotElapsed",
    );
  });

  test("succeeds after the deadline: moves collateral to the claim account, sets SellerDefaulted + AtBuyerClaim", async () => {
    const sellerAccount = await freshSellerAccount(FACE_VALUE);
    const tradeState = await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseOffsetSeconds: -90000, // deadline already passed
    });
    const claimAccount = await freshBuyerUseAccount();
    await sendAndConfirmWithRetry(
      connection,
      new Transaction().add(buildSellerDefaultClaimIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState, sellerAccount, claimAccount, securityMint, TEST_DECIMALS)),
      [payer, depositoryOps],
    );

    const claimed = await getAccount(connection, claimAccount, "confirmed", TOKEN_PROGRAM_ID);
    assert.equal(claimed.amount, FACE_VALUE);
    const sellerAfter = await getAccount(connection, sellerAccount, "confirmed", TOKEN_PROGRAM_ID);
    assert.equal(sellerAfter.amount, 0n);

    const trade = await readTradeState(connection, tradeState);
    assert.equal(STATUS_LABELS[trade.statusTag], "SellerDefaulted");
    assert.equal(COLLATERAL_LOCATION_LABELS[trade.collateralLocationTag], "AtBuyerClaim");
  });

  test("rejects if collateral is already AtBuyerUse (Buyer already exercised — nothing left to claim)", async () => {
    const sellerAccount = await freshSellerAccount(FACE_VALUE);
    const buyerUseAccount = await freshBuyerUseAccount();
    const tradeState = await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseOffsetSeconds: -90000,
    });
    await sendAndConfirmWithRetry(
      connection,
      new Transaction().add(buildExerciseRehypothecationIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState, sellerAccount, buyerUseAccount, securityMint, TEST_DECIMALS)),
      [payer, depositoryOps],
    );
    const claimAccount = await freshBuyerUseAccount();
    await expectAnchorError(
      sendAndConfirmWithRetry(
        connection,
        new Transaction().add(buildSellerDefaultClaimIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState, sellerAccount, claimAccount, securityMint, TEST_DECIMALS)),
        [payer, depositoryOps],
      ),
      "CollateralNotAtSeller",
    );
  });
});

describe("buyer_default_claim", () => {
  test("rejects before the grace-period deadline", async () => {
    const sellerAccount = await freshSellerAccount(FACE_VALUE);
    const buyerUseAccount = await freshBuyerUseAccount();
    const tradeState = await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseOffsetSeconds: -3600,
    });
    await sendAndConfirmWithRetry(
      connection,
      new Transaction().add(buildExerciseRehypothecationIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState, sellerAccount, buyerUseAccount, securityMint, TEST_DECIMALS)),
      [payer, depositoryOps],
    );
    await expectAnchorError(
      sendAndConfirmWithRetry(connection, new Transaction().add(buildBuyerDefaultClaimIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState)), [payer, depositoryOps]),
      "GracePeriodNotElapsed",
    );
  });

  test("succeeds after the deadline: status-only — Buyer's-use balance unchanged, collateral_location stays AtBuyerUse", async () => {
    const sellerAccount = await freshSellerAccount(FACE_VALUE);
    const buyerUseAccount = await freshBuyerUseAccount();
    const tradeState = await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseOffsetSeconds: -90000,
    });
    await sendAndConfirmWithRetry(
      connection,
      new Transaction().add(buildExerciseRehypothecationIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState, sellerAccount, buyerUseAccount, securityMint, TEST_DECIMALS)),
      [payer, depositoryOps],
    );

    const before = await getAccount(connection, buyerUseAccount, "confirmed", TOKEN_PROGRAM_ID);
    await sendAndConfirmWithRetry(
      connection,
      new Transaction().add(buildBuyerDefaultClaimIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState)),
      [payer, depositoryOps],
    );
    const after = await getAccount(connection, buyerUseAccount, "confirmed", TOKEN_PROGRAM_ID);

    assert.equal(after.amount, before.amount, "Buyer-default must never move funds (plan-001.md Ambiguity #4)");
    const trade = await readTradeState(connection, tradeState);
    assert.equal(STATUS_LABELS[trade.statusTag], "BuyerDefaulted");
    assert.equal(COLLATERAL_LOCATION_LABELS[trade.collateralLocationTag], "AtBuyerUse", "location stays accurate — nothing physically moved");
  });

  test("rejects if collateral is AtSeller (Buyer never rehypothecated — no default to claim)", async () => {
    const sellerAccount = await freshSellerAccount(FACE_VALUE);
    const tradeState = await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseOffsetSeconds: -90000,
    });
    await expectAnchorError(
      sendAndConfirmWithRetry(connection, new Transaction().add(buildBuyerDefaultClaimIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState)), [payer, depositoryOps]),
      "CollateralNotAtBuyerUse",
    );
  });
});

describe("grace-period boundary", () => {
  test("rejects before the deadline, succeeds once the on-chain clock passes it", async () => {
    const sellerAccount = await freshSellerAccount(FACE_VALUE);

    // Computed against the validator's own on-chain Clock sysvar, not
    // wall-clock time — a fixed real-time sleep was tried first and
    // proved unreliable: under this suite's own transaction load, the
    // on-chain clock was observed to fall more than 40 real seconds
    // behind wall-clock time in one run. The only way to test this
    // boundary reliably is to check and wait against the same clock the
    // program itself reads (Clock::get()?.unix_timestamp).
    const onChainNow = await getOnChainUnixTimestamp(connection);
    const deadline = onChainNow + 5; // 5 on-chain seconds from now
    const scheduledCloseUnix = BigInt(deadline - 86400);

    const tradeState = await openTestTrade({
      connection,
      payer,
      depositoryOps,
      sellerCustodiedAccount: sellerAccount,
      faceValueRaw: FACE_VALUE,
      scheduledCloseUnixOverride: scheduledCloseUnix,
    });
    const claimAccount = await freshBuyerUseAccount();

    await expectAnchorError(
      sendAndConfirmWithRetry(
        connection,
        new Transaction().add(buildSellerDefaultClaimIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState, sellerAccount, claimAccount, securityMint, TEST_DECIMALS)),
        [payer, depositoryOps],
      ),
      "GracePeriodNotElapsed",
    );

    await waitForOnChainTime(connection, deadline + 1);

    await sendAndConfirmWithRetry(
      connection,
      new Transaction().add(buildSellerDefaultClaimIx(DEPOSITORY_PROGRAM_ID, depositoryOps.publicKey, tradeState, sellerAccount, claimAccount, securityMint, TEST_DECIMALS)),
      [payer, depositoryOps],
    );
    const trade = await readTradeState(connection, tradeState);
    assert.equal(STATUS_LABELS[trade.statusTag], "SellerDefaulted");
  });
});
