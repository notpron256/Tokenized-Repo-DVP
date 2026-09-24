/**
 * Replicates tokenized-deposit-settlement's backend/src/solana/
 * identityCommitment.ts byte-for-byte (read, not imported — that
 * project's own scripts and this repo's have no shared dependency), so
 * the Travel Rule memo this repo posts hashes identically to what that
 * project's own compliance views would independently recompute from the
 * same Postgres row.
 */
import crypto from "node:crypto";

export interface IdentityFields {
  name: string;
  registration_id: string;
  legal_address: string;
}

export function canonicalIdentityBytes(client: IdentityFields): Buffer {
  const fields = [client.name, client.registration_id, client.legal_address];
  return Buffer.concat(
    fields.map((field) => {
      const bytes = Buffer.from(field, "utf-8");
      return Buffer.concat([Buffer.from(`${bytes.length}:`, "utf-8"), bytes]);
    }),
  );
}

export function identityHash(client: IdentityFields): string {
  return crypto.createHash("sha256").update(canonicalIdentityBytes(client)).digest("hex");
}
