import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ evaluate: vi.fn(), legacyAuth: vi.fn() }));
vi.mock("@/lib/auth-config", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth-config")>(),
  getAuthMode: () => "firebase_bff", getJenfuPlatformAuthMode: () => "on"
}));
vi.mock("@/lib/entitlement-config", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/entitlement-config")>(),
  getJenfuEntitlementMode: () => "enforce"
}));
vi.mock("@/lib/auth-async", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth-async")>(),
  requireAuthAsync: mocks.legacyAuth
}));
vi.mock("@/lib/jenfu-principal-http", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-http")>(),
  principalRequestInput: (token: string) => ({ token, keyRing: {}, identityIssuer: "issuer", trustPolicy: {}, database: {} })
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissions: mocks.evaluate
}));

import { issueJenfuPrincipalSession } from "@/lib/jenfu-principal-session";
import { NUMBERING_ACTION_PERMISSION_CODES, NUMBERING_PAGE_PERMISSION_CODES } from "@/lib/numbering-permission-codes";
import { GET } from "@/app/api/numbering/permissions/route";

function request() {
  const now = Math.floor(Date.now() / 1000);
  const token = issueJenfuPrincipalSession({
    principalId: "principal-one", employeeId: "employee-one", identityIssuer: "issuer",
    identitySubject: "subject", authEpoch: 0, accountLifecycleVersion: 1,
    profileVersion: 1, companyId: "company-one", authenticatedAt: now - 60,
    assuranceLevel: "aal1", secondFactor: null, assurancePolicyHash: "a".repeat(64)
  }, { issuer: "issuer", audience: "ai-pdm", currentKeyId: "one",
    keys: { one: "task-only-test-signing-key-at-least-32-bytes" } }, now);
  return new Request("https://pdm.example/api/numbering/permissions", {
    headers: { cookie: `__session=${token}` }
  });
}

afterEach(() => vi.clearAllMocks());

describe("principal-keyed numbering permission projection", () => {
  it("uses the verified principal evaluator for all codes and never reads the legacy user role", async () => {
    const total = NUMBERING_PAGE_PERMISSION_CODES.length + NUMBERING_ACTION_PERMISSION_CODES.length;
    mocks.evaluate.mockResolvedValue(Array.from({ length: total }, (_, index) => ({
      allowed: index === 0 || index === NUMBERING_PAGE_PERMISSION_CODES.length,
      permissionCode: index < NUMBERING_PAGE_PERMISSION_CODES.length
        ? NUMBERING_PAGE_PERMISSION_CODES[index]
        : NUMBERING_ACTION_PERMISSION_CODES[index - NUMBERING_PAGE_PERMISSION_CODES.length]
    })));
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.pages[NUMBERING_PAGE_PERMISSION_CODES[0]]).toBe(true);
    expect(body.actions[NUMBERING_ACTION_PERMISSION_CODES[0]]).toBe(true);
    expect(body.actions[NUMBERING_ACTION_PERMISSION_CODES[1]]).toBe(false);
    expect(mocks.evaluate).toHaveBeenCalledWith(expect.objectContaining({
      permissions: expect.arrayContaining([{ permissionKind: "page", permissionCode: NUMBERING_PAGE_PERMISSION_CODES[0] }])
    }));
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("fails closed on a partial principal projection instead of falling back to the legacy user", async () => {
    mocks.evaluate.mockResolvedValue([]);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });
});
