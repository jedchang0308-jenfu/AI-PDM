import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ withVerified: vi.fn(), legacyAuth: vi.fn(), queryOne: vi.fn() }));
vi.mock("@/lib/auth-config", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth-config")>(),
  getAuthMode: () => "firebase_bff", getJenfuPlatformAuthMode: () => "on"
}));
vi.mock("@/lib/entitlement-config", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/entitlement-config")>(),
  getJenfuEntitlementMode: () => "enforce"
}));
vi.mock("@/lib/auth-async", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth-async")>(), requireAuthAsync: mocks.legacyAuth
}));
vi.mock("@/lib/jenfu-principal-http", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-http")>(),
  principalRequestInput: (token: string) => ({ token, keyRing: {}, identityIssuer: "issuer", trustPolicy: {}, database: {} })
}));
vi.mock("@/lib/jenfu-principal-request-guard", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: mocks.withVerified
}));

import { POST } from "@/app/api/account/sessions/[sessionId]/revoke/route";
import { hashJenfuPrincipalSessionId } from "@/lib/jenfu-principal-session-registry";
import { issueJenfuPrincipalSession } from "@/lib/jenfu-principal-session";

const currentSessionId = "session-0123456789abcdef";
const otherRecordId = "b".repeat(64);

function request() {
  const now = Math.floor(Date.now() / 1000);
  const token = issueJenfuPrincipalSession({
    principalId: "principal-one", employeeId: "employee-one", identityIssuer: "issuer",
    identitySubject: "subject", authEpoch: 0, accountLifecycleVersion: 1,
    profileVersion: 1, companyId: "company-one", authenticatedAt: now - 60,
    assuranceLevel: "aal1", secondFactor: null, assurancePolicyHash: "a".repeat(64)
  }, { issuer: "issuer", audience: "ai-pdm", currentKeyId: "one",
    keys: { one: "task-only-test-signing-key-at-least-32-bytes" } }, now);
  return new Request("https://pdm.example/api/account/sessions/other/revoke", {
    method: "POST", headers: { cookie: `__session=${token}`, origin: "https://pdm.example",
      "content-type": "application/json" }, body: JSON.stringify({ reason: "lost device" })
  });
}

afterEach(() => vi.clearAllMocks());

describe("principal-owned session revocation", () => {
  it("revokes only another record of the verified principal in a read-write snapshot", async () => {
    mocks.withVerified.mockImplementation(async (_input, evaluate, options) => {
      expect(options).toEqual({ readOnly: false });
      return evaluate({ kind: "postgres", queryOne: mocks.queryOne },
        { session: { principalId: "principal-one", sessionId: currentSessionId } });
    });
    mocks.queryOne.mockResolvedValue({ session_id_hash: otherRecordId });
    const response = await POST(request(), { params: Promise.resolve({ sessionId: otherRecordId }) });
    expect(response.status).toBe(200);
    expect(mocks.queryOne).toHaveBeenCalledWith(expect.stringContaining("WHERE principal_id=:principalId"),
      { principalId: "principal-one", recordId: otherRecordId,
        currentHash: hashJenfuPrincipalSessionId(currentSessionId), reason: "lost device" });
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("does not use this endpoint to revoke the current session", async () => {
    mocks.withVerified.mockImplementation(async (_input, evaluate) =>
      evaluate({ kind: "postgres", queryOne: mocks.queryOne },
        { session: { principalId: "principal-one", sessionId: currentSessionId } }));
    const response = await POST(request(), { params: Promise.resolve({ sessionId: hashJenfuPrincipalSessionId(currentSessionId) }) });
    expect(response.status).toBe(409);
    expect(mocks.queryOne).not.toHaveBeenCalled();
  });

  it("does not reveal or mutate another principal's session", async () => {
    mocks.withVerified.mockImplementation(async (_input, evaluate) =>
      evaluate({ kind: "postgres", queryOne: mocks.queryOne },
        { session: { principalId: "principal-one", sessionId: currentSessionId } }));
    mocks.queryOne.mockResolvedValue(null);
    const response = await POST(request(), { params: Promise.resolve({ sessionId: otherRecordId }) });
    expect(response.status).toBe(404);
    expect(mocks.queryOne).toHaveBeenCalledWith(expect.any(String),
      expect.objectContaining({ principalId: "principal-one", recordId: otherRecordId }));
  });
});
