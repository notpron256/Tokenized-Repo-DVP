/**
 * Shared Depository authority/config loading for this repo's scripts.
 * Mirrors tokenized-deposit-settlement's backend/src/solana/authorities.ts
 * pattern (plan-001.md's Structural decision: same coordination style,
 * one repo over) — network-scoped keys under keys/<network>/, a
 * dedicated "depository-ops" authority distinct from the developer's own
 * default Solana CLI keypair (which only pays for/signs account creation).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const RPC_URL = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
export const DEPOSITORY_PROGRAM_ID = new PublicKey(
  "8txdQqhWf2M4jvWa3kDugQThgu82Vw53QoZ8doNog9ah",
);
export const DECIMALS = 2;

/** "devnet" if SOLANA_RPC_URL points at devnet, otherwise "local" — the
 * name of the keys/ subdirectory this process reads/writes. */
export function networkLabel(): "devnet" | "local" {
  return RPC_URL.includes("devnet") ? "devnet" : "local";
}

const KEYS_DIR = path.resolve(__dirname, "../../keys", networkLabel());
const DEPOSITORY_OPS_KEYPAIR_PATH = path.join(KEYS_DIR, "depository-ops.json");
const SECURITY_MINT_ADDRESS_PATH = path.join(KEYS_DIR, "security-mint-address.json");

export function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

/** The developer's own default Solana CLI keypair — used only as the
 * fee/rent payer, never as a Depository authority. */
export function loadLocalKeypair(): Keypair {
  const keypairPath = path.join(os.homedir(), ".config/solana/id.json");
  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

/** Loads the persistent depository-ops authority keypair (mint authority
 * for the security-leg mint, and — from Phase 3 onward — the Depository
 * program's operator authority) for the current network, generating and
 * saving one on first use so the same authority is reused across runs. */
export async function loadOrCreateDepositoryOpsKeypair(connection?: Connection): Promise<Keypair> {
  if (fs.existsSync(DEPOSITORY_OPS_KEYPAIR_PATH)) {
    const secret = JSON.parse(fs.readFileSync(DEPOSITORY_OPS_KEYPAIR_PATH, "utf-8"));
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }
  const keypair = Keypair.generate();
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.writeFileSync(DEPOSITORY_OPS_KEYPAIR_PATH, JSON.stringify(Array.from(keypair.secretKey)));
  console.log(`Generated new ${networkLabel()} depository-ops keypair, saved to ${DEPOSITORY_OPS_KEYPAIR_PATH}`);

  if (networkLabel() === "local") {
    const conn = connection ?? getConnection();
    const airdropSig = await conn.requestAirdrop(keypair.publicKey, 10_000_000_000); // 10 SOL
    await conn.confirmTransaction(airdropSig, "confirmed");
    console.log(`Airdropped 10 SOL to depository-ops (${keypair.publicKey.toBase58()})`);
  } else {
    console.log(
      `New devnet depository-ops key has zero balance — fund it manually before use.`,
    );
  }

  return keypair;
}

export function readPersistedSecurityMintAddress(): PublicKey | null {
  if (!fs.existsSync(SECURITY_MINT_ADDRESS_PATH)) return null;
  const { mint } = JSON.parse(fs.readFileSync(SECURITY_MINT_ADDRESS_PATH, "utf-8"));
  return new PublicKey(mint);
}

export function persistSecurityMintAddress(mint: PublicKey): void {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.writeFileSync(SECURITY_MINT_ADDRESS_PATH, JSON.stringify({ mint: mint.toBase58() }, null, 2));
}
