/**
 * Shared Depository-program instruction builders for the test suite.
 * Deliberately not imported from scripts/*.ts: those are CLI-oriented
 * (process.argv, console.log, process.exit) and already verified as
 * working end-to-end during the build — duplicating just the instruction-
 * building shape here, rather than refactoring proven CLI scripts into
 * shared functions, avoids risking a regression in code that's already
 * been manually verified phase by phase (plan-001.md).
 *
 * Mirrors the exact account orderings and Borsh encoding already proven
 * in scripts/open-trade.ts, scripts/rehypothecate.ts, etc.
 */
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { anchorDiscriminator, encodeString, encodeU64, encodeI64, encodeU32 } from "../../../scripts/lib/borsh.js";

export const DEPOSITORY_AUTHORITY_SEED = Buffer.from("depository-authority");

export function findDepositoryAuthority(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([DEPOSITORY_AUTHORITY_SEED], programId);
}

export interface OpenPledgeParams {
  programId: PublicKey;
  depositoryOps: PublicKey;
  tradeState: PublicKey;
  sellerCustodiedAccount: PublicKey;
  securityId: string;
  faceValueRaw: bigint;
  cashAmountRaw: bigint;
  closeCashAmountRaw: bigint;
  scheduledCloseUnix: bigint;
  rateBps: number;
}

export function buildOpenPledgeIx(p: OpenPledgeParams): TransactionInstruction {
  const [depositoryAuthority] = findDepositoryAuthority(p.programId);
  const data = Buffer.concat([
    anchorDiscriminator("global", "open_pledge"),
    encodeString(p.securityId),
    encodeU64(p.faceValueRaw),
    encodeU64(p.cashAmountRaw),
    encodeU64(p.closeCashAmountRaw),
    encodeI64(p.scheduledCloseUnix),
    encodeU32(p.rateBps),
  ]);
  return new TransactionInstruction({
    programId: p.programId,
    keys: [
      { pubkey: p.depositoryOps, isSigner: true, isWritable: true },
      { pubkey: p.tradeState, isSigner: true, isWritable: true },
      { pubkey: depositoryAuthority, isSigner: false, isWritable: false },
      { pubkey: p.sellerCustodiedAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildExerciseRehypothecationIx(
  programId: PublicKey,
  depositoryOps: PublicKey,
  tradeState: PublicKey,
  sellerCustodiedAccount: PublicKey,
  buyerUseAccount: PublicKey,
  securityMint: PublicKey,
  decimals: number,
): TransactionInstruction {
  const [depositoryAuthority] = findDepositoryAuthority(programId);
  const data = Buffer.concat([anchorDiscriminator("global", "exercise_rehypothecation"), Buffer.from([decimals])]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: depositoryOps, isSigner: true, isWritable: false },
      { pubkey: tradeState, isSigner: false, isWritable: true },
      { pubkey: depositoryAuthority, isSigner: false, isWritable: false },
      { pubkey: sellerCustodiedAccount, isSigner: false, isWritable: true },
      { pubkey: buyerUseAccount, isSigner: false, isWritable: true },
      { pubkey: securityMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildReturnRehypothecatedIx(
  programId: PublicKey,
  depositoryOps: PublicKey,
  tradeState: PublicKey,
  sellerCustodiedAccount: PublicKey,
  buyerUseAccount: PublicKey,
  securityMint: PublicKey,
  decimals: number,
): TransactionInstruction {
  const data = Buffer.concat([anchorDiscriminator("global", "return_rehypothecated"), Buffer.from([decimals])]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: depositoryOps, isSigner: true, isWritable: true },
      { pubkey: tradeState, isSigner: false, isWritable: true },
      { pubkey: sellerCustodiedAccount, isSigner: false, isWritable: true },
      { pubkey: buyerUseAccount, isSigner: false, isWritable: true },
      { pubkey: securityMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildReleasePledgeIx(
  programId: PublicKey,
  depositoryOps: PublicKey,
  tradeState: PublicKey,
  sellerCustodiedAccount: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: depositoryOps, isSigner: true, isWritable: false },
      { pubkey: tradeState, isSigner: false, isWritable: true },
      { pubkey: sellerCustodiedAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: anchorDiscriminator("global", "release_pledge"),
  });
}

export function buildSellerDefaultClaimIx(
  programId: PublicKey,
  depositoryOps: PublicKey,
  tradeState: PublicKey,
  sellerCustodiedAccount: PublicKey,
  claimAccount: PublicKey,
  securityMint: PublicKey,
  decimals: number,
): TransactionInstruction {
  const [depositoryAuthority] = findDepositoryAuthority(programId);
  const data = Buffer.concat([anchorDiscriminator("global", "seller_default_claim"), Buffer.from([decimals])]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: depositoryOps, isSigner: true, isWritable: false },
      { pubkey: tradeState, isSigner: false, isWritable: true },
      { pubkey: depositoryAuthority, isSigner: false, isWritable: false },
      { pubkey: sellerCustodiedAccount, isSigner: false, isWritable: true },
      { pubkey: claimAccount, isSigner: false, isWritable: true },
      { pubkey: securityMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildBuyerDefaultClaimIx(
  programId: PublicKey,
  depositoryOps: PublicKey,
  tradeState: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: depositoryOps, isSigner: true, isWritable: false },
      { pubkey: tradeState, isSigner: false, isWritable: true },
    ],
    data: anchorDiscriminator("global", "buyer_default_claim"),
  });
}
