/**
 * Onboards a brand-new Buyer/Seller pair on the bank's devnet system for
 * each devnet test-suite run — deliberately not reusing the same Buyer
 * Prime Broker LLC / Seller Hedge Fund LP fixtures Phase 9 and manual
 * verification have already been hammering throughout this build. A
 * fresh pubkey always starts with a zero velocity window regardless of
 * history, which fully sidesteps the exact class of collision that
 * produced the Phase 4/6 velocity-cap findings (AGENTS.md), rather than
 * just documenting a pacing requirement between runs.
 *
 * Same risk ratings as the real fixtures (Buyer low, Seller medium) so
 * these tests exercise the real, asymmetric velocity caps, not a more
 * permissive stand-in.
 */
import crypto from "node:crypto";

const BANK_API_BASE = "http://localhost:4100";

export interface FreshClient {
  id: string;
  name: string;
  ataAddress: string;
  ownerAddress: string;
}

async function onboardClient(namePrefix: string, riskRating: 0 | 1 | 2): Promise<FreshClient> {
  const suffix = crypto.randomInt(100_000, 999_999).toString();
  const res = await fetch(`${BANK_API_BASE}/clients`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `${namePrefix} ${suffix}`,
      riskRating,
      kycReference: `TEST-2026-${suffix}`,
      registrationId: `LEI-TEST${suffix}`,
      legalAddress: "1 Test Street, Wilmington, DE 19801, USA",
    }),
  });
  if (res.status !== 201 && res.status !== 202) {
    throw new Error(`Onboarding "${namePrefix}" failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string; name: string; ataAddress: string; ownerAddress: string };
  return { id: body.id, name: body.name, ataAddress: body.ataAddress, ownerAddress: body.ownerAddress };
}

async function fundClient(clientId: string, amountCents: number): Promise<void> {
  const res = await fetch(`${BANK_API_BASE}/deposits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, amountCents }),
  });
  if (res.status !== 201) {
    throw new Error(`Funding failed: ${res.status} ${await res.text()}`);
  }
}

export interface FreshClientPair {
  buyer: FreshClient;
  seller: FreshClient;
}

/** Onboards a fresh Buyer (low risk) and Seller (medium risk), and funds
 * the Buyer with enough for the test's cash leg. */
export async function createFreshClientPair(buyerFundingCents: number): Promise<FreshClientPair> {
  const buyer = await onboardClient("Test Fixture Buyer", 0);
  const seller = await onboardClient("Test Fixture Seller", 1);
  await fundClient(buyer.id, buyerFundingCents);
  return { buyer, seller };
}
