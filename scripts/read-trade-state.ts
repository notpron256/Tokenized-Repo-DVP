/**
 * Phase 3 (plan-001.md): decodes and prints a TradeState account
 * (programs/depository/src/state.rs). Reused by every later phase's
 * done-test as the plain-text way to confirm on-chain trade state
 * without reading this project's own source.
 *
 * Usage: npx tsx scripts/read-trade-state.ts <TRADE_STATE_ADDRESS>
 */
import { Connection, PublicKey } from "@solana/web3.js";
import {
  anchorDiscriminator,
  decodeString,
  decodeU64,
  decodeI64,
  decodeU32,
  decodeEnumTag,
  decodePubkeyBase58,
} from "./lib/borsh.js";
import { RPC_URL } from "./lib/authorities.js";

const DAY_COUNT_LABELS = ["Actual360"];
const STATUS_LABELS = ["Open", "Closed", "SellerDefaulted", "BuyerDefaulted"];
const COLLATERAL_LOCATION_LABELS = ["AtSeller", "AtBuyerUse", "AtBuyerClaim"];

async function main() {
  const addressArg = process.argv[2];
  if (!addressArg) {
    console.error("Usage: npx tsx scripts/read-trade-state.ts <TRADE_STATE_ADDRESS>");
    process.exit(1);
  }
  const address = new PublicKey(addressArg);

  const connection = new Connection(RPC_URL, "confirmed");
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) {
    console.error(`No account found at ${address.toBase58()} on ${RPC_URL}`);
    process.exit(1);
  }

  const data = info.data;
  const expectedDiscriminator = anchorDiscriminator("account", "TradeState");
  const actualDiscriminator = data.subarray(0, 8);
  if (!actualDiscriminator.equals(expectedDiscriminator)) {
    console.error("Account discriminator does not match TradeState — wrong address or account type.");
    process.exit(1);
  }

  let offset = 8;
  let securityId: string;
  let faceValue: bigint;
  let cashAmount: bigint;
  let closeCashAmount: bigint;
  let scheduledCloseUnix: bigint;
  let rateBps: number;
  let dayCountTag: number;
  let statusTag: number;
  let collateralLocationTag: number;
  let sellerCustodiedAccount: Buffer;
  let buyerUseAccount: Buffer;

  [securityId, offset] = decodeString(data, offset);
  [faceValue, offset] = decodeU64(data, offset);
  [cashAmount, offset] = decodeU64(data, offset);
  [closeCashAmount, offset] = decodeU64(data, offset);
  [scheduledCloseUnix, offset] = decodeI64(data, offset);
  [rateBps, offset] = decodeU32(data, offset);
  [dayCountTag, offset] = decodeEnumTag(data, offset);
  [statusTag, offset] = decodeEnumTag(data, offset);
  [collateralLocationTag, offset] = decodeEnumTag(data, offset);
  [sellerCustodiedAccount, offset] = decodePubkeyBase58(data, offset);
  [buyerUseAccount, offset] = decodePubkeyBase58(data, offset);

  const faceValueDollars = Number(faceValue) / 100;
  const cashAmountDollars = Number(cashAmount) / 100;
  const closeCashAmountDollars = Number(closeCashAmount) / 100;

  console.log(`Trade-state account: ${address.toBase58()}`);
  console.log(`Security id: ${securityId}`);
  console.log(`Face value: ${faceValue.toString()} raw ($${faceValueDollars.toLocaleString("en-US", { minimumFractionDigits: 2 })})`);
  console.log(`Cash amount (open): ${cashAmount.toString()} raw ($${cashAmountDollars.toLocaleString("en-US", { minimumFractionDigits: 2 })})`);
  console.log(`Cash amount (close, incl. interest): ${closeCashAmount.toString()} raw ($${closeCashAmountDollars.toLocaleString("en-US", { minimumFractionDigits: 2 })})`);
  console.log(`Scheduled close: ${new Date(Number(scheduledCloseUnix) * 1000).toISOString()} (unix ${scheduledCloseUnix.toString()})`);
  console.log(`Rate: ${(rateBps / 100).toFixed(2)}% (${rateBps} bps)`);
  console.log(`Day count: ${DAY_COUNT_LABELS[dayCountTag] ?? `unknown(${dayCountTag})`}`);
  console.log(`Status: ${STATUS_LABELS[statusTag] ?? `unknown(${statusTag})`}`);
  console.log(`Collateral location: ${COLLATERAL_LOCATION_LABELS[collateralLocationTag] ?? `unknown(${collateralLocationTag})`}`);
  console.log(`Seller custodied account: ${new PublicKey(sellerCustodiedAccount).toBase58()}`);
  console.log(`Buyer's-use account: ${new PublicKey(buyerUseAccount).toBase58()} ${new PublicKey(buyerUseAccount).equals(PublicKey.default) ? "(not set yet)" : ""}`);
}

main().catch((err) => {
  console.error("READ TRADE STATE FAILED");
  console.error(err);
  process.exit(1);
});
