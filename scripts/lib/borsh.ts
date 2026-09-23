/**
 * Minimal manual Borsh-compatible encode/decode helpers for the
 * depository program's instruction args and account layout — mirrors
 * tokenized-deposit-settlement's own `anchorDiscriminator`-style manual
 * CPI construction (backend/scripts/create-mint.ts) rather than pulling
 * in a full borsh library for a handful of primitive fields.
 */
import crypto from "node:crypto";

export function anchorDiscriminator(namespace: "global" | "account", name: string): Buffer {
  return crypto.createHash("sha256").update(`${namespace}:${name}`).digest().subarray(0, 8);
}

export function encodeString(value: string): Buffer {
  const utf8 = Buffer.from(value, "utf-8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(utf8.length, 0);
  return Buffer.concat([len, utf8]);
}

export function decodeString(buf: Buffer, offset: number): [string, number] {
  const len = buf.readUInt32LE(offset);
  const start = offset + 4;
  const value = buf.subarray(start, start + len).toString("utf-8");
  return [value, start + len];
}

export function encodeU64(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(value, 0);
  return buf;
}

export function decodeU64(buf: Buffer, offset: number): [bigint, number] {
  return [buf.readBigUInt64LE(offset), offset + 8];
}

export function encodeI64(value: bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(value, 0);
  return buf;
}

export function decodeI64(buf: Buffer, offset: number): [bigint, number] {
  return [buf.readBigInt64LE(offset), offset + 8];
}

export function encodeU32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

export function decodeU32(buf: Buffer, offset: number): [number, number] {
  return [buf.readUInt32LE(offset), offset + 4];
}

/** Single-byte enum discriminant (Anchor encodes fieldless enum variants
 * as a u8 tag in declaration order — DayCount, TradeStatus,
 * CollateralLocation in state.rs all rely on this). */
export function decodeEnumTag(buf: Buffer, offset: number): [number, number] {
  return [buf.readUInt8(offset), offset + 1];
}

export function decodePubkeyBase58(buf: Buffer, offset: number): [Buffer, number] {
  return [buf.subarray(offset, offset + 32), offset + 32];
}
