import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { issueJenfuPrincipalSession, verifyJenfuPrincipalSession } from "@/lib/jenfu-principal-session";

const now = 1_790_260_800;
const ring = { issuer: "ai-pdm-session-issuer", audience: "ai-pdm", currentKeyId: "current", keys: { current: "k".repeat(48) } };
const input = {
  principalId: "principal-one", employeeId: "employee-one", identityIssuer: "https://issuer.example.test",
  identitySubject: "provider-subject-one", authEpoch: 0, accountLifecycleVersion: 3,
  profileVersion: 2, companyId: "company-one", authenticatedAt: now - 300,
  assuranceLevel: "aal1" as const, secondFactor: null,
  assurancePolicyHash: "a".repeat(64), maxAgeSeconds: 60,
};

function signedMutation(token: string, mutate: (header: Record<string, unknown>, claims: Record<string, unknown>) => void) {
  const [encodedHeader, encodedClaims] = token.split(".");
  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as Record<string, unknown>;
  const claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8")) as Record<string, unknown>;
  mutate(header, claims);
  const message = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;
  return `${message}.${crypto.createHmac("sha256", ring.keys.current).update(message).digest("base64url")}`;
}

describe("AI-PDM principal session v2", () => {
  it("issues a principal-bound token without a PDM user security claim", () => {
    const token = issueJenfuPrincipalSession(input, ring, now);
    const claims = verifyJenfuPrincipalSession(token, ring, { nowSeconds: now });
    expect(claims).toMatchObject({ version: 2, principalId: "principal-one", epochKind: "principal", authEpoch: 0 });
    expect(claims).not.toHaveProperty("localPrincipalId");
    expect(claims).not.toHaveProperty("pdmUserId");
  });

  it("rejects UID fields, wrong epoch kind and the old token type even with a valid MAC", () => {
    const token = issueJenfuPrincipalSession(input, ring, now);
    for (const mutate of [
      (_header: Record<string, unknown>, claims: Record<string, unknown>) => { claims.localPrincipalId = "pdm-user-one"; },
      (_header: Record<string, unknown>, claims: Record<string, unknown>) => { claims.epochKind = "provider_pair"; },
      (header: Record<string, unknown>) => { header.type = "JENFU-AI-PDM"; },
    ]) expect(() => verifyJenfuPrincipalSession(signedMutation(token, mutate), ring, { nowSeconds: now })).toThrow();
  });

  it("rejects a tampered token, stale token and unsafe lifecycle or profile versions", () => {
    const token = issueJenfuPrincipalSession(input, ring, now);
    const tampered = `${token.slice(0, -1)}${token.endsWith("x") ? "y" : "x"}`;
    expect(() => verifyJenfuPrincipalSession(tampered, ring, { nowSeconds: now })).toThrow();
    expect(() => verifyJenfuPrincipalSession(token, ring, { nowSeconds: now + 61 })).toThrow("JENFU_PRINCIPAL_SESSION_TIME_INVALID");
    expect(() => issueJenfuPrincipalSession({ ...input, profileVersion: 0 }, ring, now)).toThrow("JENFU_PRINCIPAL_SESSION_CLAIMS_INVALID");
    expect(() => issueJenfuPrincipalSession({ ...input, authEpoch: -1 }, ring, now)).toThrow("JENFU_PRINCIPAL_SESSION_CLAIMS_INVALID");
  });
});
