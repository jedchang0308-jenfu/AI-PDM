import { beforeEach, describe, expect, it, vi } from "vitest";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";

const mocks = vi.hoisted(() => ({
  withVerified: vi.fn(),
  executeCommand: vi.fn(),
  principalRequestInput: vi.fn(),
  principalSessionToken: vi.fn(),
  getDatabase: vi.fn()
}));

vi.mock("@/lib/auth-config", () => ({
  getAuthMode: () => "firebase_bff",
  getJenfuPlatformAuthMode: () => "on"
}));
vi.mock("@/lib/entitlement-config", () => ({ getJenfuEntitlementMode: () => "enforce" }));
vi.mock("@/lib/jenfu-entitlement-contract", () => ({
  createJenfuVerifiedAuthorizationActor: (input: unknown) => input
}));
vi.mock("@/lib/jenfu-principal-http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jenfu-principal-http")>();
  return {
    ...actual,
    principalRequestInput: mocks.principalRequestInput,
    principalSessionTokenFromRequest: mocks.principalSessionToken
  };
});
vi.mock("@/lib/jenfu-principal-request-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jenfu-principal-request-guard")>();
  return { ...actual, withVerifiedJenfuPrincipalRequest: mocks.withVerified };
});
vi.mock("@/lib/platform-command-service", () => ({ executePdmCommandWithOutbox: mocks.executeCommand }));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: mocks.getDatabase }));

import { executePrincipalReadonlyShareCommand } from "@/lib/principal-readonly-share-command";

const verified = {
  profile: { pdmUserId: "profile-one", companyId: "company-one" },
  session: {
    identityIssuer: "https://identity.example.test",
    identitySubject: "subject-one",
    principalId: "principal-one",
    employeeId: "employee-one"
  }
} as never;

function input() {
  return {
    request: new Request("https://ai-pdm.test/api/submissions/submission-one/shares", { method: "POST" }),
    routePath: "src/app/api/submissions/[id]/shares/route.ts",
    method: "POST" as const,
    commandName: "pdm.submission_share.create" as const,
    submissionId: "submission-one",
    payload: { submissionId: "submission-one", label: "review", days: 7 },
    idempotencyPayload: { submissionId: "submission-one", label: "review", days: 7 },
    execute: vi.fn(async () => ({ id: "share-one" })),
    event: () => ({ aggregateType: "submission_share", aggregateId: "share-one",
      eventType: "SubmissionShareCreated", payload: {} })
  };
}

describe("share command transaction denial mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.principalSessionToken.mockReturnValue("session-token");
    mocks.principalRequestInput.mockReturnValue({ token: "session-token" });
    mocks.withVerified.mockImplementation(async (_guardInput, evaluate) => evaluate({}, verified));
    mocks.getDatabase.mockReturnValue({});
  });

  it("preserves typed session revocation after the outer Principal preflight", async () => {
    mocks.executeCommand.mockRejectedValue(new JenfuPrincipalRequestError("auth_epoch_stale"));

    const response = await executePrincipalReadonlyShareCommand(input());

    expect(mocks.withVerified).toHaveBeenCalledTimes(1);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
    expect(await (response as Response).json()).toEqual({ code: "auth_session_invalid" });
  });

  it("preserves published grant withdrawal after the outer Principal preflight", async () => {
    mocks.executeCommand.mockRejectedValue(new JenfuEntitlementRepositoryError("permission_not_granted"));

    const response = await executePrincipalReadonlyShareCommand(input());

    expect(mocks.withVerified).toHaveBeenCalledTimes(1);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(403);
    expect(await (response as Response).json()).toMatchObject({ error: "permission_not_granted" });
  });

  it("keeps typed dependency failure unavailable after the outer Principal preflight", async () => {
    mocks.executeCommand.mockRejectedValue(new JenfuPrincipalRequestError("principal_dependency_unavailable"));

    const response = await executePrincipalReadonlyShareCommand(input());

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(503);
    expect(await (response as Response).json()).toEqual({ code: "principal_dependency_unavailable" });
  });

  it("does not trust a raw permission-denied sentinel as typed authorization evidence", async () => {
    mocks.executeCommand.mockRejectedValue(new Error("PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED"));

    const response = await executePrincipalReadonlyShareCommand(input());

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(503);
    expect(await (response as Response).json()).toEqual({ code: "principal_dependency_unavailable" });
  });
});
