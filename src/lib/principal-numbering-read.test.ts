import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), input: vi.fn(), failure: vi.fn(), verified: vi.fn(),
  company: vi.fn(), requestedCompany: vi.fn(), permission: vi.fn(), deny: vi.fn(),
  authMode: vi.fn(), platformMode: vi.fn(), entitlementMode: vi.fn()
}));

vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: mocks.token,
  principalRequestInput: mocks.input,
  principalRequestFailure: mocks.failure
}));
vi.mock("@/lib/jenfu-principal-request-guard", () => ({
  JenfuPrincipalRequestError: class extends Error {},
  withVerifiedJenfuPrincipalRequest: mocks.verified
}));
vi.mock("@/lib/company-context", () => ({ resolvePrincipalCompanyContextInSnapshot: mocks.company }));
vi.mock("@/lib/numbering-company-context", () => ({ requestedNumberingCompanyCodeFromRequest: mocks.requestedCompany }));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.permission
}));
vi.mock("@/lib/jenfu-entitlement-http", () => ({ jenfuEntitlementFailureResponse: mocks.deny }));
vi.mock("@/lib/auth-config", () => ({ getAuthMode: mocks.authMode,
  getJenfuPlatformAuthMode: mocks.platformMode }));
vi.mock("@/lib/entitlement-config", () => ({ getJenfuEntitlementMode: mocks.entitlementMode }));

import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";

const request = new Request("https://example.test/api/numbering/search?company_code=JENFU");
const snapshot = { transactionScope: "postgres" };
const verified = { session: { principalId: "principal-1" }, profile: { companyId: "company-jenfu" } };
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };

describe("principal numbering read snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("v2-token");
    mocks.input.mockReturnValue({ token: "v2-token" });
    mocks.authMode.mockReturnValue("firebase_bff");
    mocks.platformMode.mockReturnValue("on");
    mocks.entitlementMode.mockReturnValue("enforce");
    mocks.verified.mockImplementation(async (_input, evaluate) => evaluate(snapshot, verified));
    mocks.requestedCompany.mockReturnValue({ state: "valid", companyCode: "JENFU" });
    mocks.company.mockResolvedValue({ company, response: null });
    mocks.permission.mockResolvedValue([{ allowed: true, principalId: "principal-1",
      permissionCode: "numbering.search" }]);
    mocks.deny.mockReturnValue(Response.json({ error: "permission_not_granted" }, { status: 403 }));
    mocks.failure.mockReturnValue(Response.json({ code: "principal_dependency_unavailable" }, { status: 503 }));
  });

  it("runs the company, permission and resource read in the same verified snapshot", async () => {
    const read = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const response = await withPrincipalNumberingCompanyRead(request, "numbering.search", read);
    expect(response?.status).toBe(200);
    expect(mocks.company).toHaveBeenCalledWith(snapshot, verified,
      { state: "valid", companyCode: "JENFU" });
    expect(mocks.permission).toHaveBeenCalledWith(snapshot, verified,
      [{ permissionKind: "page", permissionCode: "numbering.search" }]);
    expect(read).toHaveBeenCalledWith(snapshot, company, verified);
  });

  it("does not reach the resource when the principal is denied", async () => {
    mocks.permission.mockResolvedValue([{ allowed: false, principalId: "principal-1",
      permissionCode: "numbering.search",
      decisionCode: "permission_not_granted" }]);
    const read = vi.fn();
    const response = await withPrincipalNumberingCompanyRead(request, "numbering.search", read);
    expect(response?.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });

  it("fails closed if the evaluator returns another principal", async () => {
    mocks.permission.mockResolvedValue([{ allowed: true, principalId: "principal-2",
      permissionCode: "numbering.search" }]);
    const read = vi.fn();
    const response = await withPrincipalNumberingCompanyRead(request, "numbering.search", read);
    expect(response?.status).toBe(503);
    expect(read).not.toHaveBeenCalled();
  });

  it("accepts one of the route's explicit permissions without using a legacy role", async () => {
    const permissions = [
      { permissionKind: "page" as const, permissionCode: "numbering.search" },
      { permissionKind: "action" as const, permissionCode: "numbering.create" }
    ];
    mocks.permission.mockResolvedValue([
      { allowed: false, principalId: "principal-1", permissionCode: "numbering.search",
        decisionCode: "permission_not_granted" },
      { allowed: true, principalId: "principal-1", permissionCode: "numbering.create",
        decisionCode: "allowed" }
    ]);
    const read = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const response = await withPrincipalNumberingCompanyRead(request, permissions, read);
    expect(response?.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith(snapshot, verified, permissions);
    expect(read).toHaveBeenCalledWith(snapshot, company, verified);
  });

  it("fails closed if one alternative belongs to a different principal", async () => {
    mocks.permission.mockResolvedValue([
      { allowed: true, principalId: "principal-1", permissionCode: "numbering.search" },
      { allowed: false, principalId: "principal-2", permissionCode: "numbering.drawings.view" }
    ]);
    const read = vi.fn();
    const response = await withPrincipalNumberingCompanyRead(request, [
      { permissionKind: "page", permissionCode: "numbering.search" },
      { permissionKind: "page", permissionCode: "numbering.drawings.view" }
    ], read);
    expect(response?.status).toBe(503);
    expect(read).not.toHaveBeenCalled();
  });

  it("fails closed if a decision is returned for another permission", async () => {
    mocks.permission.mockResolvedValue([{ allowed: true, principalId: "principal-1",
      permissionCode: "numbering.reports" }]);
    const read = vi.fn();
    const response = await withPrincipalNumberingCompanyRead(request, "numbering.search", read);
    expect(response?.status).toBe(503);
    expect(read).not.toHaveBeenCalled();
  });
});
