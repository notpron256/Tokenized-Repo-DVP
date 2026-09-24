/**
 * Arm's-length references to the bank's already-deployed devnet system
 * (plan-001.md's Structural decision: hardcoded program/mint IDs and
 * manual instruction-building, no shared workspace, no Anchor TS client
 * — the same pattern tokenized-deposit-settlement's own backend already
 * uses for its own two on-chain programs, extended across repos).
 *
 * Also provides read-only access to that project's Postgres, exactly as
 * its own backend does (backend/src/db/pool.ts) — used only to retrieve
 * a client's onboarding record and custodied keypair, the same way its
 * own transferFlow.ts does. Never writes to this database, and never
 * touches tokenized-deposit-settlement's own files.
 */
import pg from "pg";
import { Keypair, PublicKey } from "@solana/web3.js";

export const BANK_MINT = new PublicKey("FmhghJTej3gn2bsn3ho5jK4F2ZAJVd9zwV6UHbMg9McX");
export const BANK_HOOK_PROGRAM_ID = new PublicKey("9AxMnpb5g8c8DSnDHNYEeafiTrSzWZbthoDEQpTKiD5z");
export const BANK_DECIMALS = 2;

const BANK_DATABASE_URL =
  process.env.BANK_DATABASE_URL ?? "postgresql://deposit_poc:deposit_poc@localhost:5432/deposit_poc_devnet";

export interface BankClientRow {
  id: string;
  name: string;
  ata_address: string;
  owner_address: string;
  status: string;
  registration_id: string;
  legal_address: string;
}

export function bankPool(): pg.Pool {
  return new pg.Pool({ connectionString: BANK_DATABASE_URL });
}

export async function loadBankClient(pool: pg.Pool, clientId: string): Promise<BankClientRow> {
  const { rows } = await pool.query(
    `SELECT id, name, ata_address, owner_address, status, registration_id, legal_address FROM clients WHERE id = $1`,
    [clientId],
  );
  if (rows.length === 0) {
    throw new Error(`No bank client with id ${clientId}`);
  }
  return rows[0];
}

/** Reads a client's bank-custodied signing keypair directly from Postgres
 * — the same table (`client_keys`) tokenized-deposit-settlement's own
 * transferFlow.ts reads to sign an ordinary transfer on the client's
 * behalf (see project-findings-and-working-notes.md's Phase 4 entry for
 * why this, not a bank operator authority, is the real signer). */
export async function loadBankClientKeypair(pool: pg.Pool, clientId: string): Promise<Keypair> {
  const { rows } = await pool.query(`SELECT secret_key FROM client_keys WHERE client_id = $1`, [clientId]);
  if (rows.length === 0) {
    throw new Error(`No custodied key found for bank client ${clientId}`);
  }
  return Keypair.fromSecretKey(Uint8Array.from(rows[0].secret_key));
}

export interface RecordSettledCashLegParams {
  signature: string;
  senderClientId: string;
  recipientClientId: string;
  amountCents: bigint;
}

/**
 * Mirrors transferFlow.ts's own settlement write exactly (same tables,
 * same fields, same 'settled' status, same cash_balance_cents +
 * tokenized_cents together for an ordinary transfer) — see
 * project-findings-and-working-notes.md for why this repo has to do
 * this itself: the cash leg is composed and submitted externally to the
 * bank's own /transfers endpoint (necessary, to combine it atomically
 * with the pledge leg), so nothing else ever writes this row.
 *
 * Idempotent at the application level (check-then-insert on
 * tx_signature), not via a database UNIQUE constraint — transfer_events
 * has no unique index on tx_signature (only indexer.ts's separate
 * indexed_transfers table does), and adding one would be a schema
 * change to tokenized-deposit-settlement, not just a data read/write.
 * Safe under this repo's own sequential script execution; not a
 * guarantee under true concurrent callers.
 *
 * Caller is responsible for having already waited for "finalized"
 * commitment (see lib/finality.ts) before calling this — matching
 * transferFlow.ts's own gating, this never fires at merely "confirmed".
 */
export async function recordSettledCashLegIfNeeded(
  pool: pg.Pool,
  params: RecordSettledCashLegParams,
): Promise<"recorded" | "already-recorded"> {
  const { rows: existing } = await pool.query(`SELECT id FROM transfer_events WHERE tx_signature = $1`, [
    params.signature,
  ]);
  if (existing.length > 0) {
    return "already-recorded";
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO transfer_events (sender_client_id, recipient_client_id, amount_cents, status, tx_signature)
       VALUES ($1, $2, $3, 'settled', $4)`,
      [params.senderClientId, params.recipientClientId, params.amountCents.toString(), params.signature],
    );
    await client.query(
      `UPDATE ledger_balances
       SET cash_balance_cents = cash_balance_cents - $1, tokenized_cents = tokenized_cents - $1, updated_at = now()
       WHERE client_id = $2`,
      [params.amountCents.toString(), params.senderClientId],
    );
    await client.query(
      `UPDATE ledger_balances
       SET cash_balance_cents = cash_balance_cents + $1, tokenized_cents = tokenized_cents + $1, updated_at = now()
       WHERE client_id = $2`,
      [params.amountCents.toString(), params.recipientClientId],
    );
    await client.query("COMMIT");
    return "recorded";
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
