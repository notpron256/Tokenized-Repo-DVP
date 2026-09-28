/**
 * Module 4 (Test): the ledger-mirror write's idempotency under retry —
 * spec-001.md's Areas of concern ("bounded, self-healing consistency
 * window") and project-findings-and-working-notes.md's Phase 4 entry.
 * Needs only the bank's local Postgres (already running via its own
 * docker-compose, per Phase 0) — no Solana RPC, no validator, no
 * devnet. A real regression here would mean a retried settlement write
 * silently double-applies a balance delta, corrupting the bank's ledger
 * exactly the way this mechanism exists to prevent.
 *
 * Run: npx tsx --test tests/ledger/mirror-idempotency.test.ts
 * (requires the sibling project's postgres container running — see
 * fixtures/devnet-accounts.md for how it was started.)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { bankPool, loadBankClient, recordSettledCashLegIfNeeded } from "../../scripts/lib/bank.js";
import type pg from "pg";

const BUYER_CLIENT_ID = "22056748-4d61-4413-ac87-db38b012f427";
const SELLER_CLIENT_ID = "6e6be62e-48da-454b-8d7a-eb24844eb548";

let pool: pg.Pool;

before(() => {
  pool = bankPool();
});

after(async () => {
  await pool.end();
});

test("recordSettledCashLegIfNeeded applies the balance delta exactly once, even when called twice with the same signature", async () => {
  // A signature that has never been seen before, so this test's effect
  // is fully attributable and independently undoable — never a real
  // devnet signature already recorded by an actual settlement.
  const fakeSignature = `test-idempotency-${crypto.randomBytes(16).toString("hex")}`;
  const amountCents = 12_345n;

  const buyerBefore = await loadBankClient(pool, BUYER_CLIENT_ID);
  const sellerBefore = await loadBankClient(pool, SELLER_CLIENT_ID);
  const { rows: buyerLedgerBefore } = await pool.query("SELECT tokenized_cents FROM ledger_balances WHERE client_id = $1", [BUYER_CLIENT_ID]);
  const { rows: sellerLedgerBefore } = await pool.query("SELECT tokenized_cents FROM ledger_balances WHERE client_id = $1", [SELLER_CLIENT_ID]);

  try {
    const first = await recordSettledCashLegIfNeeded(pool, {
      signature: fakeSignature,
      senderClientId: BUYER_CLIENT_ID,
      recipientClientId: SELLER_CLIENT_ID,
      amountCents,
    });
    assert.equal(first, "recorded");

    const second = await recordSettledCashLegIfNeeded(pool, {
      signature: fakeSignature,
      senderClientId: BUYER_CLIENT_ID,
      recipientClientId: SELLER_CLIENT_ID,
      amountCents,
    });
    assert.equal(second, "already-recorded", "a retry with the same signature must be a no-op, not a second application");

    const { rows: buyerLedgerAfter } = await pool.query("SELECT tokenized_cents FROM ledger_balances WHERE client_id = $1", [BUYER_CLIENT_ID]);
    const { rows: sellerLedgerAfter } = await pool.query("SELECT tokenized_cents FROM ledger_balances WHERE client_id = $1", [SELLER_CLIENT_ID]);

    // The delta must reflect exactly ONE application of amountCents, not
    // two — this is the actual regression this test exists to catch.
    assert.equal(
      BigInt(buyerLedgerBefore[0].tokenized_cents) - BigInt(buyerLedgerAfter[0].tokenized_cents),
      amountCents,
    );
    assert.equal(
      BigInt(sellerLedgerAfter[0].tokenized_cents) - BigInt(sellerLedgerBefore[0].tokenized_cents),
      amountCents,
    );

    const { rows: eventRows } = await pool.query("SELECT count(*) FROM transfer_events WHERE tx_signature = $1", [fakeSignature]);
    assert.equal(Number(eventRows[0].count), 1, "exactly one transfer_events row, not two");
  } finally {
    // Undo this test's own effect — this file must be safe to run
    // repeatedly against the real bank database without accumulating
    // drift, unlike the fixtures this suite deliberately avoids reusing
    // for the devnet velocity-window reason (see tests/devnet/).
    await pool.query("DELETE FROM transfer_events WHERE tx_signature = $1", [fakeSignature]);
    await pool.query("UPDATE ledger_balances SET tokenized_cents = tokenized_cents + $1, cash_balance_cents = cash_balance_cents + $1 WHERE client_id = $2", [amountCents.toString(), BUYER_CLIENT_ID]);
    await pool.query("UPDATE ledger_balances SET tokenized_cents = tokenized_cents - $1, cash_balance_cents = cash_balance_cents - $1 WHERE client_id = $2", [amountCents.toString(), SELLER_CLIENT_ID]);
  }
});
