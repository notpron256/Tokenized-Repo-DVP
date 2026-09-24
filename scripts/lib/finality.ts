/**
 * Replicates tokenized-deposit-settlement's backend/src/solana/
 * finality.ts exactly (read, not imported) — waits for a transaction to
 * reach Solana's "finalized" commitment, distinct from "confirmed",
 * before this repo's own ledger-mirroring write (see
 * lib/bank.ts's recordSettledTransferIfNeeded) is allowed to claim the
 * bank's settlement terminology, matching the bank's own finality-gating
 * discipline rather than writing at "confirmed".
 */
import { Connection, Transaction } from "@solana/web3.js";

export async function waitForFinalized(connection: Connection, signature: string, tx: Transaction): Promise<void> {
  if (!tx.recentBlockhash || tx.lastValidBlockHeight === undefined) {
    throw new Error(
      "Transaction is missing recentBlockhash/lastValidBlockHeight — cannot wait for finalized commitment",
    );
  }
  const result = await connection.confirmTransaction(
    { signature, blockhash: tx.recentBlockhash, lastValidBlockHeight: tx.lastValidBlockHeight },
    "finalized",
  );
  if (result.value.err) {
    throw new Error(`Transaction ${signature} did not finalize successfully: ${JSON.stringify(result.value.err)}`);
  }
}
