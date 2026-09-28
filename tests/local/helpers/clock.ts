/**
 * Polls the validator's real on-chain Clock sysvar directly, rather than
 * sleeping a fixed number of real seconds and hoping the on-chain clock
 * kept pace. Found necessary empirically: under this suite's own
 * transaction load, a local validator's on-chain unix_timestamp fell
 * behind real wall-clock time by more than 40 seconds in one observed
 * run (slot production is not guaranteed to track wall-clock 1:1,
 * especially under load) — a fixed sleep is fundamentally the wrong tool
 * for "wait until the on-chain grace-period deadline has passed."
 *
 * Clock sysvar layout: slot(8) + epoch_start_timestamp(8) + epoch(8) +
 * leader_schedule_epoch(8) + unix_timestamp(8), all little-endian.
 */
import { Connection, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";

export async function getOnChainUnixTimestamp(connection: Connection): Promise<number> {
  const info = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY, "confirmed");
  if (!info) throw new Error("Clock sysvar account not found");
  return Number(info.data.readBigInt64LE(32));
}

/** Polls until the on-chain clock reaches or passes `targetUnixTimestamp`,
 * or throws after `maxWaitMs`. */
export async function waitForOnChainTime(connection: Connection, targetUnixTimestamp: number, maxWaitMs = 180_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const now = await getOnChainUnixTimestamp(connection);
    if (now >= targetUnixTimestamp) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const finalOnChain = await getOnChainUnixTimestamp(connection);
  throw new Error(
    `On-chain clock did not reach ${targetUnixTimestamp} within ${maxWaitMs}ms (real time) — ` +
      `stuck at ${finalOnChain}, ${targetUnixTimestamp - finalOnChain}s short. ` +
      `The validator's slot production is likely stalled or badly lagging wall-clock time.`,
  );
}
