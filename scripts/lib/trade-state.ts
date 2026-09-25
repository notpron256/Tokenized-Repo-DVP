/**
 * Shared TradeState decoder (programs/depository/src/state.rs), used by
 * every script from Phase 6 onward instead of re-deriving the same
 * manual offset math each time (Phases 3–5's scripts each did this
 * inline; kept as-is there rather than churned, since they're already
 * verified — new scripts use this).
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { anchorDiscriminator } from "./borsh.js";

export interface TradeState {
  securityId: string;
  faceValue: bigint;
  cashAmount: bigint;
  closeCashAmount: bigint;
  scheduledCloseUnix: bigint;
  rateBps: number;
  dayCountTag: number;
  statusTag: number;
  collateralLocationTag: number;
  sellerCustodiedAccount: PublicKey;
  buyerUseAccount: PublicKey;
}

export async function readTradeState(connection: Connection, address: PublicKey): Promise<TradeState> {
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) {
    throw new Error(`No trade-state account found at ${address.toBase58()}`);
  }
  const data = info.data;
  const expectedDiscriminator = anchorDiscriminator("account", "TradeState");
  if (!data.subarray(0, 8).equals(expectedDiscriminator)) {
    throw new Error("Account discriminator does not match TradeState");
  }

  let offset = 8;
  const securityIdLen = data.readUInt32LE(offset);
  offset += 4;
  const securityId = data.subarray(offset, offset + securityIdLen).toString("utf-8");
  offset += securityIdLen;
  const faceValue = data.readBigUInt64LE(offset);
  offset += 8;
  const cashAmount = data.readBigUInt64LE(offset);
  offset += 8;
  const closeCashAmount = data.readBigUInt64LE(offset);
  offset += 8;
  const scheduledCloseUnix = data.readBigInt64LE(offset);
  offset += 8;
  const rateBps = data.readUInt32LE(offset);
  offset += 4;
  const dayCountTag = data.readUInt8(offset);
  offset += 1;
  const statusTag = data.readUInt8(offset);
  offset += 1;
  const collateralLocationTag = data.readUInt8(offset);
  offset += 1;
  const sellerCustodiedAccount = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const buyerUseAccount = new PublicKey(data.subarray(offset, offset + 32));

  return {
    securityId,
    faceValue,
    cashAmount,
    closeCashAmount,
    scheduledCloseUnix,
    rateBps,
    dayCountTag,
    statusTag,
    collateralLocationTag,
    sellerCustodiedAccount,
    buyerUseAccount,
  };
}

export const STATUS_LABELS = ["Open", "Closed", "SellerDefaulted", "BuyerDefaulted"];
export const COLLATERAL_LOCATION_LABELS = ["AtSeller", "AtBuyerUse", "AtBuyerClaim"];
