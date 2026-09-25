/**
 * Phase 9 (plan-001.md): the full-lifecycle end-to-end script — the
 * sign-off run for the whole POC. Reproduces spec-001.md's exact
 * documented Example trade ($1,000,000 cash / $1,020,409 collateral /
 * $1,000,101.39 close), not this repo's $500k operational default for
 * casual future trades, end to end in one run: open, rehypothecate,
 * return, close.
 *
 * Deliberately does NOT re-run Phase 0 (client onboarding) or literally
 * re-invoke Phase 2's mint creation as fresh actions — Phase 0's
 * onboarding has no dedup on the bank's side (re-running it would create
 * duplicate client rows, not verify anything), so this script only reads
 * and confirms those prerequisites already hold, exactly the way a real
 * settlement operator would check an existing setup rather than
 * re-provisioning it on every trade. Phase 2's security-mint script IS
 * safely re-invoked, since it's genuinely idempotent (reuses the
 * existing mint/account, only tops up if short).
 *
 * Each step shells out to the same script already built and verified
 * for that phase (open-trade.ts, rehypothecate.ts, return-collateral.ts,
 * close-trade.ts) rather than re-implementing their logic — this proves
 * the exact code paths already exercised phase by phase, not a fresh
 * reimplementation that could quietly diverge from them.
 *
 * Usage: SOLANA_RPC_URL=https://api.devnet.solana.com npx tsx scripts/e2e-full-lifecycle.ts
 */
import { execFileSync } from "node:child_process";
import { bankPool, loadBankClient } from "./lib/bank.js";

const BUYER_CLIENT_ID = "22056748-4d61-4413-ac87-db38b012f427";
const SELLER_CLIENT_ID = "6e6be62e-48da-454b-8d7a-eb24844eb548";

// spec-001.md's Example trade, exactly.
const CASH_AMOUNT_RAW = "100000000"; // $1,000,000.00
const FACE_VALUE_RAW = "102040900"; // $1,020,409.00
const CLOSE_CASH_AMOUNT_RAW = "100010139"; // $1,000,101.39

const DEVNET_ENV = { ...process.env, SOLANA_RPC_URL: "https://api.devnet.solana.com" };

function runScript(label: string, script: string, args: string[]): string {
  console.log();
  console.log(`=== ${label} ===`);
  const output = execFileSync("npx", ["tsx", `scripts/${script}`, ...args], {
    encoding: "utf-8",
    env: DEVNET_ENV,
  });
  console.log(output);
  return output;
}

function extractTradeState(output: string): string {
  const match = output.match(/Trade-state (?:address|):\s*([1-9A-HJ-NP-Za-km-z]{32,44})/);
  if (!match) {
    throw new Error(`Could not find a trade-state address in output:\n${output}`);
  }
  return match[1];
}

async function main() {
  console.log("Phase 9 (plan-001.md): full-lifecycle end-to-end run");
  console.log("Reproducing spec-001.md's Example trade: $1,000,000 cash / $1,020,409 collateral / $1,000,101.39 close");

  // --- Step 0: confirm Phase 0's prerequisites, don't re-provision them ---
  console.log();
  console.log("=== Step 0: confirming Buyer/Seller onboarding prerequisites (read-only) ===");
  const pool = bankPool();
  try {
    const buyer = await loadBankClient(pool, BUYER_CLIENT_ID);
    const seller = await loadBankClient(pool, SELLER_CLIENT_ID);
    if (buyer.status !== "active" || seller.status !== "active") {
      throw new Error(`Buyer/Seller are not both active (buyer: ${buyer.status}, seller: ${seller.status}) — see fixtures/devnet-accounts.md.`);
    }
    console.log(`Buyer (${buyer.name}) and Seller (${seller.name}) confirmed active.`);
  } finally {
    await pool.end();
  }

  // --- Step 2: ensure the security mint + custodial funding exist (idempotent) ---
  runScript("Step 2: security mint + custodial funding (idempotent)", "create-security-mint.ts", []);

  // --- Step 4 (open leg) ---
  const openOutput = runScript("Step 3/4: open-leg atomic transaction", "open-trade.ts", [
    `--cash-amount-raw=${CASH_AMOUNT_RAW}`,
    `--face-value-raw=${FACE_VALUE_RAW}`,
    `--close-cash-amount-raw=${CLOSE_CASH_AMOUNT_RAW}`,
  ]);
  const tradeState = extractTradeState(openOutput);
  console.log(`>>> Trade-state for this run: ${tradeState}`);

  // --- Step 5 (rehypothecation exercise) ---
  runScript("Step 5: rehypothecation exercise", "rehypothecate.ts", [tradeState]);

  // --- Step 6a (return of collateral) ---
  runScript("Step 6a: return of collateral", "return-collateral.ts", [tradeState]);

  // --- Step 6b (close-leg atomic transaction) ---
  const closeOutput = runScript("Step 6b: close-leg atomic transaction", "close-trade.ts", [tradeState]);

  console.log();
  console.log("=== SIGN-OFF SUMMARY ===");
  console.log(`Trade-state account: ${tradeState}`);
  console.log("Full lifecycle completed: open -> rehypothecate -> return -> close, all on devnet.");
  console.log("Spot-check these independently before treating this run as verified:");
  console.log(`  - Open-leg and close-leg transaction signatures printed above (search each on https://explorer.solana.com/tx/<sig>?cluster=devnet)`);
  console.log(`  - npx tsx scripts/read-trade-state.ts ${tradeState}  (expect Status: Closed)`);
}

main().catch((err) => {
  console.error("E2E FULL LIFECYCLE FAILED");
  console.error(err);
  process.exit(1);
});
