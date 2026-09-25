import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAction: vi.fn(),
  resolveCompany: vi.fn()
}));

vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: () => ({ kind: "postgres" }) }));
vi.mock("@/lib/numbering-permission-guard", () => ({ requireNumberingActionAsync: mocks.requireAction }));
vi.mock("@/lib/numbering-company-context", () => ({
  requestedNumberingCompanyCodeFromRequest: () => null,
  resolveNumberingCompanyContextAsync: mocks.resolveCompany
}));
vi.mock("@/lib/company-context", () => ({ getUserCompanyAuthorityAsync: vi.fn() }));
vi.mock("@/lib/repositories/user-async-repository", () => ({ AsyncUserRepository: vi.fn() }));
vi.mock("@/lib/production-smoke-runtime", () => ({ assertProductionSmokeRuntimeIsolation: vi.fn() }));

import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";

const verified = {
  identityIssuer: "https://issuer.test", identitySubject: "subject-one",
  principalId: "principal-one", employeeId: "employee-one",
  localPrincipalId: "profile-one", companyId: "company-one",
  sessionSchemaVersion: 2 as const
};

describe("DEV-121 command ingress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCompany.mockResolvedValue({
      company: { companyId: "company-one", companyCode: "JENFU", companyKind: "business" }, response: null
    });
  });

  async function ingress(authorizationActor?: typeof verified, localRole = "Engineer") {
    mocks.requireAction.mockResolvedValue({
      user: { id: "profile-one", role: localRole, company_id: "company-one", authorizationActor },
      permission: { allowed: true, roleCode: "rd", evaluatedRoles: ["rd"] }, response: null
    });
    return requireNumberingPlatformCommandAsync(new Request("https://ai-pdm.test/api/numbering/records", {
      method: "POST", headers: { "idempotency-key": "operation-one" }
    }), { action: "numbering.create", body: {} });
  }

  it("rejects a PostgreSQL human command without a verified actor before producing metadata", async () => {
    const result = await ingress();
    expect(result.response?.status).toBe(401);
    expect(result.actor).toBeNull();
    expect(result.metadata).toBeNull();
  });

  it("does not use a verified principal for another company", async () => {
    const result = await ingress({ ...verified, companyId: "company-two" });
    expect(result.response?.status).toBe(403);
    expect(result.metadata).toBeNull();
  });

  it("passes the exact verified principal and idempotency key into the command", async () => {
    const result = await ingress(verified, "Admin");
    expect(result.response).toBeNull();
    if (result.response) return;
    expect(result.actor.principalId).toBe(verified.principalId);
    expect(result.actor.roles).toEqual(["rd"]);
    expect(result.actor.legacyRole).toBeUndefined();
    expect(result.metadata.actor.authorizationActor).toEqual(verified);
    expect(result.metadata.idempotencyKey).toBe("operation-one");
  });
});
