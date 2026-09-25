import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), audit: vi.fn() }));
const ring = {
  issuer: "https://pdm.example", audience: "ai-pdm", currentKeyId: "one",
  keys: { one: "task-only-test-signing-key-at-least-32-bytes" }
};

vi.mock("@/lib/auth-config", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth-config")>(),
  getAuthMode: () => "firebase_bff",
  getJenfuPlatformAuthMode: () => "on"
}));
vi.mock("@/lib/platform-session-key-ring", () => ({ getPlatformSessionKeyRing: () => ring }));
vi.mock("@/lib/request-origin", () => ({ isAllowedRequestOrigin: () => true }));
vi.mock("@/lib/db-async-provider", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/db-async-provider")>(),
  getAsyncDatabaseClient: () => ({ kind: "postgres", execute: mocks.execute })
}));
vi.mock("@/lib/audit-async", () => ({ createAuditLogAsync: mocks.audit }));

import { issueJenfuPrincipalSession } from "@/lib/jenfu-principal-session";
import { POST } from "@/app/api/auth/logout/route";

function request() {
  const now = Math.floor(Date.now() / 1000);
  const token = issueJenfuPrincipalSession({
    principalId: "principal-one", employeeId: "employee-one",
    identityIssuer: "https://identity.example", identitySubject: "provider-one",
    authEpoch: 0, accountLifecycleVersion: 3, profileVersion: 2,
    companyId: "company-one", authenticatedAt: now - 60,
    assuranceLevel: "aal1", secondFactor: null,
    assurancePolicyHash: "a".repeat(64)
  }, ring, now);
  return new Request("https://pdm.example/api/auth/logout", {
    method: "POST", headers: { cookie: `__session=${token}` }
  });
}

afterEach(() => vi.clearAllMocks());

describe("principal-keyed local logout", () => {
  it("revokes the principal session before clearing browser cookies", async () => {
    mocks.execute.mockResolvedValue(undefined);
    mocks.audit.mockResolvedValue(undefined);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("ai_pdm_core.principal_session_records"),
      expect.objectContaining({ principalId: "principal-one", reason: "logout" }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      detail: { securityActor: expect.objectContaining({ principalId: "principal-one" }) }
    }));
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("returns a dependency error without claiming logout when revocation fails", async () => {
    mocks.execute.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
