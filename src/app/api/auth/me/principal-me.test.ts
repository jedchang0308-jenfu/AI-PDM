import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withVerified: vi.fn(), getUserById: vi.fn(), getCompany: vi.fn(), legacyAuth: vi.fn()
}));
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
vi.mock("@/lib/repositories/user-async-repository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/repositories/user-async-repository")>(),
  AsyncUserRepository: class {
    getUserById = mocks.getUserById;
  }
}));

import { issueJenfuPrincipalSession } from "@/lib/jenfu-principal-session";
import { GET } from "@/app/api/auth/me/route";

function request() {
  const now = Math.floor(Date.now() / 1000);
  const token = issueJenfuPrincipalSession({
    principalId: "principal-one", employeeId: "employee-one", identityIssuer: "issuer",
    identitySubject: "subject", authEpoch: 0, accountLifecycleVersion: 1,
    profileVersion: 1, companyId: "company-jenfu", authenticatedAt: now - 60,
    assuranceLevel: "aal1", secondFactor: null, assurancePolicyHash: "a".repeat(64)
  }, { issuer: "issuer", audience: "ai-pdm", currentKeyId: "one",
    keys: { one: "task-only-test-signing-key-at-least-32-bytes" } }, now);
  return new Request("https://pdm.example/api/auth/me", { headers: { cookie: `__session=${token}` } });
}

afterEach(() => vi.clearAllMocks());

describe("principal-keyed current account summary", () => {
  it("returns domain display data without treating the old Admin role as security authority", async () => {
    mocks.withVerified.mockImplementation(async (_input, evaluate) => evaluate({ query: mocks.getCompany }, {
      profile: { pdmUserId: "pdm-one", companyId: "company-jenfu" },
      session: { principalId: "principal-one", contractVersion: "jenfu.ai-pdm-session.v2" }
    }));
    mocks.getUserById.mockResolvedValue({ id: "pdm-one", display_name: "Person One",
      email: "one@example.com", role: "Admin", company_id: "company-jenfu" });
    mocks.getCompany.mockResolvedValue([{ id: "company-jenfu", company_code: "JENFU",
      company_kind: "business", display_name: "Jenfu" }]);
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({ id: "pdm-one", role: null });
    expect(body.user.default_company).toMatchObject({ companyId: "company-jenfu", is_default: true });
    expect(body.session.principalId).toBe("principal-one");
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
    expect(mocks.getCompany).toHaveBeenCalledWith(expect.stringContaining("ai_pdm_core.companies"),
      { companyId: "company-jenfu" });
  });

  it("rejects missing company binding rather than returning a stale profile", async () => {
    mocks.withVerified.mockImplementation(async (_input, evaluate) => evaluate({ query: mocks.getCompany }, {
      profile: { pdmUserId: "pdm-one", companyId: "company-jenfu" }, session: {}
    }));
    mocks.getUserById.mockResolvedValue({ id: "pdm-one", role: "Admin", company_id: "company-jenfu" });
    mocks.getCompany.mockResolvedValue([{ id: "company-two", company_code: "JENFU",
      company_kind: "business", display_name: "Other" }]);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });
});
