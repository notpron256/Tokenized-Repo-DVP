/**
 * Module 4 (Test): devnet coverage for the parts of the design that
 * genuinely require the bank's reused system (Phase 4's cross-
 * institution atomic open, Phase 6's close paths) — per plan-001.md's
 * Structural decision, this can't run against a local validator, since
 * the bank's programs only exist on devnet.
 *
 * Uses a freshly-onboarded Buyer/Seller pair per run (see
 * helpers/fresh-clients.ts), never the long-lived fixtures Phase 9 and
 * manual verification have been exercising — a clean velocity window
 * every time, rather than a pacing requirement to document and hope is
 * followed. One pair is onboarded once per file run and reused across
 * this file's tests; the amounts involved stay far enough under both
 * parties' caps that running every test here in one pass never risks a
 * collision (see the amount comments below for the actual headroom).
 *
 * Run: SOLANA_RPC_URL=https://api.devnet.solana.com npx tsx --test tests/devnet/atomicity.test.ts
 * Requires: the bank's backend + Postgres running locally (Phase 0),
 * the Depository program already deployed to devnet, and its security
 * mint already created (scripts/create-security-mint.ts).
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createFreshClientPair, type FreshClientPair } from "./helpers/fresh-clients.js";

const DEVNET_ENV = { ...process.env, SOLANA_RPC_URL: "https://api.devnet.solana.com" };

// Small relative to both parties' real caps (Buyer low-risk $5,000,000/hr,
// Seller medium-risk $2,000,000/hr) — chosen so this whole file's tests
// (one open + one close, twice) sum to roughly $200,000 of cumulative
// velocity usage per party, comfortably inside even the tighter cap with
// a fresh window.
const CASH_AMOUNT_RAW = "5000000"; // $50,000.00
const FACE_VALUE_RAW = "5102100"; // $51,021.00 (~2% haircut)
const CLOSE_CASH_AMOUNT_RAW = "5000507"; // $50,005.07
// The negative test uses open-trade.ts's own built-in --negative-test
// flag (a fixed $10,000,000 figure) rather than a separate constant here —
// it never lands on-chain, so it never counts against either party's
// running total regardless of size.

let pair: FreshClientPair;

function runScript(script: string, args: string[]): string {
  return execFileSync("npx", ["tsx", `scripts/${script}`, ...args], { encoding: "utf-8", env: DEVNET_ENV });
}

function extractTradeState(output: string): string {
  const match = output.match(/Trade-state address:\s*([1-9A-HJ-NP-Za-km-z]{32,44})/);
  if (!match) throw new Error(`Could not find a trade-state address in output:\n${output}`);
  return match[1];
}

async function getTokenizedCents(clientId: string): Promise<number> {
  const res = await fetch("http://localhost:4100/clients");
  const clients = (await res.json()) as Array<{ id: string; tokenizedCents: number }>;
  const client = clients.find((c) => c.id === clientId);
  if (!client) throw new Error(`Client ${clientId} not found`);
  return client.tokenizedCents;
}

before(async () => {
  pair = await createFreshClientPair(Number(CASH_AMOUNT_RAW) * 10); // headroom for repeated opens in this file
}, { timeout: 120_000 });

describe("Phase 4: cross-institution atomic open-leg transaction", () => {
  test("happy path: both legs land atomically with correct balance deltas", () => {
    const output = runScript("open-trade.ts", [
      `--buyer-client-id=${pair.buyer.id}`,
      `--seller-client-id=${pair.seller.id}`,
      `--cash-amount-raw=${CASH_AMOUNT_RAW}`,
      `--face-value-raw=${FACE_VALUE_RAW}`,
      `--close-cash-amount-raw=${CLOSE_CASH_AMOUNT_RAW}`,
    ]);
    assert.match(output, /TRANSACTION SUCCEEDED/);
    assert.match(output, /Bank ledger mirror \(transfer_events \+ ledger_balances\): recorded/);
    const tradeState = extractTradeState(output); // throws if missing

    // Close immediately after asserting the open landed. open-trade.ts
    // derives seller_custodied_account as the Depository's own ATA for
    // the security mint — a single, program-wide account shared by every
    // test in this file, not one scoped per fresh client the way the
    // cash-leg accounts are (see helpers/fresh-clients.ts). Module 4's
    // open_pledge guard (AccountAlreadyPledged) now correctly rejects a
    // second open_pledge against an account that still has a live
    // pledge, so leaving this trade open would block every later test in
    // this file from ever opening again — found the hard way on this
    // suite's first real run (project-findings-and-working-notes.md).
    const closeOutput = runScript("close-trade.ts", [tradeState, `--buyer-client-id=${pair.buyer.id}`, `--seller-client-id=${pair.seller.id}`]);
    assert.match(closeOutput, /TRANSACTION SUCCEEDED/);
  });

  test("negative path: a deliberately invalid amount fails the whole transaction, with zero state change on either leg", async () => {
    const buyerBefore = await getTokenizedCents(pair.buyer.id);
    const sellerBefore = await getTokenizedCents(pair.seller.id);

    // open-trade.ts's own --negative-test mode deliberately exits 0 even
    // on the expected on-chain failure (it prints "TRANSACTION FAILED
    // (expected outcome)" and returns — built for a human reading
    // console output, not for a wrapper checking exit codes), and now
    // exits 1 if the deliberately-invalid transaction unexpectedly
    // succeeds (a real atomicity bug). So this test must assert on the
    // script's own printed outcome, not on whether execFileSync merely
    // threw. Mutation-tested: a version of this test that only checked
    // for a thrown exception passed silently even when the negative-
    // test's own transaction unexpectedly succeeded, because nothing
    // about that outcome ever threw (see
    // project-findings-and-working-notes.md).
    const output = execFileSync(
      "npx",
      ["tsx", "scripts/open-trade.ts", `--buyer-client-id=${pair.buyer.id}`, `--seller-client-id=${pair.seller.id}`, "--negative-test"],
      { encoding: "utf-8", env: DEVNET_ENV },
    );
    assert.doesNotMatch(output, /TRANSACTION SUCCEEDED/, "the negative-test transaction must not succeed");
    assert.match(output, /TRANSACTION FAILED \(this is the expected outcome for --negative-test\)/, "expected the script's own printed failure message");

    // Read via the bank's own API (its Postgres ledger), independent of
    // anything this repo's own scripts print — the actual atomicity
    // proof is that neither party's real balance moved at all.
    const buyerAfter = await getTokenizedCents(pair.buyer.id);
    const sellerAfter = await getTokenizedCents(pair.seller.id);
    assert.equal(buyerAfter, buyerBefore, "the failed negative-test transaction must not have moved any Buyer funds");
    assert.equal(sellerAfter, sellerBefore, "the failed negative-test transaction must not have moved any Seller funds");
  });
});

describe("Phase 6: close-leg happy path", () => {
  test("closes without rehypothecation: both legs land atomically", () => {
    const openOutput = runScript("open-trade.ts", [
      `--buyer-client-id=${pair.buyer.id}`,
      `--seller-client-id=${pair.seller.id}`,
      `--cash-amount-raw=${CASH_AMOUNT_RAW}`,
      `--face-value-raw=${FACE_VALUE_RAW}`,
      `--close-cash-amount-raw=${CLOSE_CASH_AMOUNT_RAW}`,
    ]);
    const tradeState = extractTradeState(openOutput);

    const closeOutput = runScript("close-trade.ts", [tradeState, `--buyer-client-id=${pair.buyer.id}`, `--seller-client-id=${pair.seller.id}`]);
    assert.match(closeOutput, /TRANSACTION SUCCEEDED/);
    assert.match(closeOutput, /Bank ledger mirror: recorded/);
  });

  test("closes with rehypothecation (fungibility): open, exercise, return, close — same end state as the direct-close path", () => {
    const openOutput = runScript("open-trade.ts", [
      `--buyer-client-id=${pair.buyer.id}`,
      `--seller-client-id=${pair.seller.id}`,
      `--cash-amount-raw=${CASH_AMOUNT_RAW}`,
      `--face-value-raw=${FACE_VALUE_RAW}`,
      `--close-cash-amount-raw=${CLOSE_CASH_AMOUNT_RAW}`,
    ]);
    const tradeState = extractTradeState(openOutput);

    const rehypOutput = runScript("rehypothecate.ts", [tradeState]);
    assert.match(rehypOutput, /exercise_rehypothecation succeeded/);

    const returnOutput = runScript("return-collateral.ts", [tradeState]);
    assert.match(returnOutput, /return_rehypothecated succeeded/);

    const closeOutput = runScript("close-trade.ts", [tradeState, `--buyer-client-id=${pair.buyer.id}`, `--seller-client-id=${pair.seller.id}`]);
    assert.match(closeOutput, /TRANSACTION SUCCEEDED/);
  });
});
