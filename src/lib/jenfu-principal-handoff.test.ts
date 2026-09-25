import { describe, expect, it } from "vitest";
import vectors from "../../contracts/jenfu-sso-handoff/v2/conformance-vectors.json";
import { parseJenfuPrincipalHandoff } from "@/lib/jenfu-principal-handoff";

const clock = Date.parse(vectors.clock);
const issuer = vectors.valid.issuer;

function mutated(path: string, value: unknown) {
  const proof = structuredClone(vectors.valid) as Record<string, unknown>;
  const parts = path.split(".");
  let target = proof;
  for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
  target[parts.at(-1)!] = value;
  return proof;
}

describe("DEV-121 principal handoff v2", () => {
  it("accepts the source-locked zero-epoch vector without a legacy authorization field", () => {
    const proof = parseJenfuPrincipalHandoff(vectors.valid, issuer, clock);
    expect(proof.authState.authEpoch).toBe(0);
    expect(proof.identity.principalId).toBe("principal-one");
    expect(proof).not.toHaveProperty("authorization");
  });

  it.each(vectors.negativeMutations)("rejects source contract mutation $id", ({ path, value }) => {
    expect(() => parseJenfuPrincipalHandoff(mutated(path, value), issuer, clock)).toThrow();
  });

  it("rejects wrong issuer, unbounded proof lifetime and invalid dates", () => {
    expect(() => parseJenfuPrincipalHandoff(vectors.valid, "https://other.example.test/api/sso", clock)).toThrow("HANDOFF_INVALID");
    expect(() => parseJenfuPrincipalHandoff(mutated("expiresAt", "2026-09-24T12:03:00.000Z"), issuer, clock)).toThrow("HANDOFF_EXPIRED");
    expect(() => parseJenfuPrincipalHandoff(mutated("authentication.authenticatedAt", "not-a-date"), issuer, clock)).toThrow("HANDOFF_EXPIRED");
  });
});
