import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { createPlatformActorContext, type PdmCommandMetadata } from "@/lib/platform-command";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(), evaluate: vi.fn(), readScope: vi.fn()
}));
vi.mock("@/lib/platform-command-service", () => ({ executePdmCommandWithOutbox: mocks.execute }));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/repositories/drawing-recognition-part-work-handoff-async-repository", () => ({
  DrawingRecognitionPartWorkHandoffAsyncRepository: class {
    readScope = mocks.readScope;
  }
}));

import { handoffDrawingRecognitionToPartWorks } from "@/lib/drawing-recognition-part-work-handoff";

const principalId = "principal-one";
const actorId = "profile-one";
const companyId = "company-one";
const sessionId = "recognition-one";
const snapshot = { kind: "postgres" } as AsyncDatabaseClient;
const verified = {
  session: { principalId }, profile: { pdmUserId: actorId, companyId }
} as VerifiedPrincipalRequest;
const actor = createPlatformActorContext({
  pdmUserId: actorId, organizationId: companyId,
  authorizationActor: {
    identityIssuer: "issuer", identitySubject: "subject", principalId,
    employeeId: "employee-one", localPrincipalId: actorId,
    companyId, sessionSchemaVersion: 2
  }
});
const metadata: PdmCommandMetadata = {
  actor, idempotencyKey: "recognition-handoff-one",
  principalRequest: { token: "verified-token" } as PdmCommandMetadata["principalRequest"],
  principalAuthorization: {
    request: new Request(`https://ai-pdm.test/api/numbering/recognition-sessions/${sessionId}/handoff`, { method: "POST" }),
    routePath: "src/app/api/numbering/recognition-sessions/[sessionId]/handoff/route.ts",
    method: "POST", permissionCode: "numbering.recognition.formalize"
  }
};
const primaryDecision = {
  allowed: true, principalId, permissionCode: "numbering.recognition.formalize", roleCode: "rd"
};

function handoff() {
  return handoffDrawingRecognitionToPartWorks({
    sessionId, companyId, actorId, expectedRowVersion: 1,
    expectedSourceSetFingerprint: "source-one", expectedRelationScopeFingerprint: "relation-one",
    draft: { commonValues: [], overrides: [] }, metadata, client: snapshot
  });
}

describe("recognition handoff uses the verified Principal command snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.evaluate.mockResolvedValue([
      { allowed: true, principalId, permissionCode: "numbering.workspace.create", roleCode: "rd" },
      { allowed: true, principalId, permissionCode: "numbering.workspace.update", roleCode: "rd" }
    ]);
    mocks.readScope.mockResolvedValue({ session: null });
    mocks.execute.mockImplementation(async (input) => ({
      result: await input.execute(snapshot, primaryDecision, verified),
      reusedFromCommandReceipt: false
    }));
  });

  it("passes session and route proof, then checks both workspace grants before reading the resource", async () => {
    await expect(handoff()).rejects.toMatchObject({ code: "RECOGNITION_SESSION_NOT_FOUND" });
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      principalRequest: metadata.principalRequest,
      principalAuthorization: metadata.principalAuthorization
    }));
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, verified, [
      { permissionKind: "action", permissionCode: "numbering.workspace.create" },
      { permissionKind: "action", permissionCode: "numbering.workspace.update" }
    ]);
    expect(mocks.readScope).toHaveBeenCalledOnce();
  });

  it("rejects a revoked workspace grant without reading or changing the resource", async () => {
    mocks.evaluate.mockResolvedValueOnce([
      { allowed: true, principalId, permissionCode: "numbering.workspace.create", roleCode: "rd" },
      { allowed: false, principalId, permissionCode: "numbering.workspace.update", roleCode: null }
    ]);
    await expect(handoff()).rejects.toMatchObject({ code: "RECOGNITION_HANDOFF_PERMISSION_DENIED" });
    expect(mocks.readScope).not.toHaveBeenCalled();
  });

  it("rejects an actor/profile mismatch before evaluating grants", async () => {
    const mismatched = { ...verified, profile: { ...verified.profile, pdmUserId: "other-profile" } } as VerifiedPrincipalRequest;
    mocks.execute.mockImplementationOnce(async (input) => ({
      result: await input.execute(snapshot, primaryDecision, mismatched),
      reusedFromCommandReceipt: false
    }));
    await expect(handoff()).rejects.toMatchObject({ code: "RECOGNITION_HANDOFF_PERMISSION_DENIED" });
    expect(mocks.evaluate).not.toHaveBeenCalled();
    expect(mocks.readScope).not.toHaveBeenCalled();
  });
});
