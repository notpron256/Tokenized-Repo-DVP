/**
 * A local solana-test-validator under this suite's own load (many
 * sequential transactions, no pacing between them) occasionally hits
 * "Unable to obtain a new blockhash after 10000ms" — a real, observed
 * transient flake against this specific validator, not a Depository
 * program bug (the program logic itself was already proven correct
 * against real, hours-aged trades on devnet in Phase 7). Retrying with a
 * freshly-fetched blockhash resolves it in practice.
 */
import { Connection, Signer, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";

/** For calls into @solana/spl-token's own high-level helpers
 * (createAccount, mintTo, ...), which do their own internal
 * sendAndConfirmTransaction we have no way to wrap directly — retries the
 * whole operation instead. Safe for these specific helpers because each
 * one either generates its own fresh Keypair internally or is naturally
 * idempotent-by-amount (mintTo topping up); this is not a general-purpose
 * "retry any side-effecting operation" tool. */
export async function retryOnTransientBlockhashError<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("Unable to obtain a new blockhash")) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastErr;
}

export async function sendAndConfirmWithRetry(
  connection: Connection,
  tx: Transaction,
  signers: Signer[],
  attempts = 3,
): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await sendAndConfirmTransaction(connection, tx, signers);
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("Unable to obtain a new blockhash")) {
        throw err;
      }
      // Force a fresh blockhash on the next attempt rather than reusing
      // whatever this Transaction object cached.
      tx.recentBlockhash = undefined;
      tx.lastValidBlockHeight = undefined;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastErr;
}
