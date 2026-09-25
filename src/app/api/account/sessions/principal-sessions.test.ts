import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ withVerified: vi.fn(), legacyAuth: vi.fn(), query: vi.fn() }));
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

import { GET } from "@/app/api/account/sessions/route";
import { hashJenfuPrincipalSessionId } from "@/lib/jenfu-principal-session-registry";
import { issueJenfuPrincipalSession } from "@/lib/jenfu-principal-session";

function request() {
  const now = Math.floor(Date.now() / 1000);
  const token = issueJenfuPrincipalSession({
    principalId: "principal-one", employeeId: "employee-one", identityIssuer: "issuer",
    identitySubject: "subject", authEpoch: 0, accountLifecycleVersion: 1,
    profileVersion: 1, companyId: "company-one", authenticatedAt: now - 60,
    assuranceLevel: "aal2", secondFactor: "google_workspace_mfa", assurancePolicyHash: "a".repeat(64)
  }, { issuer: "issuer", audience: "ai-pdm", currentKeyId: "one",
    keys: { one: "task-only-test-signing-key-at-least-32-bytes" } }, now);
  return new Request("https://pdm.example/api/account/sessions", { headers: { cookie: `__session=${token}` } });
}

afterEach(() => vi.clearAllMocks());

describe("principal-keyed session list", () => {
  it("reads only the verified principal's session records without a UID lookup", async () => {
    const currentHash = hashJenfuPrincipalSessionId("session-0123456789abcdef");
    mocks.withVerified.mockImplementation(async (_input, evaluate) => evaluate({ kind: "postgres", query: mocks.query }, {
      profile: { pdmUserId: "pdm-one", companyId: "company-one" },
      session: { principalId: "principal-one", sessionId: "session-0123456789abcdef" }
    }));
    mocks.query.mockResolvedValue([{ principal_id: "principal-one", session_id_hash: currentHash,
      assurance_level: "aal2", issued_at: "2026-09-25T00:00:00.000Z",
      last_seen_at: "2026-09-25T00:01:00.000Z", expires_at: "2026-09-25T08:00:00.000Z", revoked_at: null }]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).sessions).toMatchObject([{ id: currentHash,
      current: true, authProvider: "principal", assuranceLevel: "aal2", ipSummary: null }]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("WHERE principal_id=:principalId"),
      { principalId: "principal-one" });
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("fails closed if a session row belongs to a different principal", async () => {
    mocks.withVerified.mockImplementation(async (_input, evaluate) => evaluate({ kind: "postgres", query: mocks.query }, {
      profile: { pdmUserId: "pdm-one", companyId: "company-one" },
      session: { principalId: "principal-one", sessionId: "session-0123456789abcdef" }
    }));
    mocks.query.mockResolvedValue([{ principal_id: "principal-other", session_id_hash: "b".repeat(64),
      assurance_level: "aal1", issued_at: "2026-09-25T00:00:00.000Z",
      last_seen_at: "2026-09-25T00:01:00.000Z", expires_at: "2026-09-25T08:00:00.000Z", revoked_at: null }]);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });
});
