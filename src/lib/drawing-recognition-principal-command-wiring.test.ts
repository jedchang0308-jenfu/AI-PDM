import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { createPlatformActorContext, type PdmCommandMetadata } from "@/lib/platform-command";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(), assertSessionScope: vi.fn(), calculateImpact: vi.fn(),
  applyFormalization: vi.fn(), requirePostRelease: vi.fn(),
  assertRecognitionWriteLifecycle: vi.fn(), getProjection: vi.fn(), createSession: vi.fn(),
  commit: vi.fn(), saveDecisions: vi.fn()
}));
vi.mock("@/lib/platform-command-service", () => ({ executePdmCommandWithOutbox: mocks.execute }));
vi.mock("@/lib/repositories/drawing-recognition-async-repository", () => ({
  DrawingRecognitionAsyncRepository: class {
    assertSessionScope = mocks.assertSessionScope;
    calculateImpact = mocks.calculateImpact;
    applyFormalization = mocks.applyFormalization;
    assertRecognitionWriteLifecycle = mocks.assertRecognitionWriteLifecycle;
    getProjection = mocks.getProjection;
    createSession = mocks.createSession;
    commit = mocks.commit;
    saveDecisions = mocks.saveDecisions;
  }
}));
vi.mock("@/lib/drawing-recognition-formalization-authorization", () => ({
  requireRecognitionPostReleaseGrantInSnapshot: mocks.requirePostRelease
}));

import {
  cancelDrawingRecognitionAmendment, commitDrawingRecognition,
  createDrawingRecognitionAmendment, formalizeDrawingRecognition,
  issueRecognitionImpactToken, rerunDrawingRecognition, saveDrawingRecognitionDecisions
} from "@/lib/drawing-recognition";

const snapshot = { kind: "postgres" } as AsyncDatabaseClient;
const principalId = "principal-one";
const pdmUserId = "profile-one";
const companyId = "company-one";
const sessionId = "recognition-one";
const verified = { session: { principalId } } as VerifiedPrincipalRequest;
const actor = createPlatformActorContext({
  pdmUserId, organizationId: companyId,
  authorizationActor: {
    identityIssuer: "issuer", identitySubject: "subject", principalId,
    employeeId: "employee-one", localPrincipalId: pdmUserId,
    companyId, sessionSchemaVersion: 2
  }
});
const metadata: PdmCommandMetadata = {
  actor, idempotencyKey: "recognition-command-one",
  principalRequest: { token: "verified-token" } as PdmCommandMetadata["principalRequest"],
  principalAuthorization: {
    request: new Request(`https://ai-pdm.test/api/numbering/recognition-sessions/${sessionId}/formalize`, { method: "POST" }),
    routePath: "src/app/api/numbering/recognition-sessions/[sessionId]/formalize/route.ts",
    method: "POST", permissionCode: "numbering.recognition.formalize"
  }
};

describe("recognition commands retain the verified Principal context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertSessionScope.mockResolvedValue({ status: "formalized", row_version: 1 });
    mocks.execute.mockResolvedValue({ result: { ok: true }, reusedFromCommandReceipt: false });
  });

  it.each([
    ["amendment", () => createDrawingRecognitionAmendment({
      sessionId, companyId, actorId: pdmUserId, roles: ["rd"], metadata, client: snapshot
    })],
    ["commit", () => commitDrawingRecognition({
      sessionId, companyId, actorId: pdmUserId, roles: ["rd"], expectedRowVersion: 1,
      decisions: [], metadata, client: snapshot
    })],
    ["cancel", () => cancelDrawingRecognitionAmendment({
      sessionId, companyId, actorId: pdmUserId, roles: ["rd"], expectedRowVersion: 1,
      metadata, client: snapshot
    })],
    ["formalize", () => formalizeDrawingRecognition({
      sessionId, companyId, actorId: pdmUserId, roles: ["rd"], metadata, client: snapshot,
      impactToken: issueRecognitionImpactToken({ sessionId, companyId,
        sessionRowVersion: 1, impactFingerprint: "impact-one" })
    })]
  ] as const)("passes Principal request and route proof through %s", async (_name, run) => {
    await run();
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      principalRequest: metadata.principalRequest,
      principalAuthorization: metadata.principalAuthorization
    }));
  });

  it("checks the current impact and post-release grant in the command's write snapshot", async () => {
    mocks.calculateImpact.mockResolvedValue({ impactFingerprint: "impact-one", requiresPostReleaseChange: true });
    mocks.applyFormalization.mockResolvedValue({ ok: true });
    mocks.execute.mockImplementationOnce(async (input) => ({
      result: await input.execute(snapshot, { roleCode: "rd" }, verified),
      reusedFromCommandReceipt: false
    }));
    await formalizeDrawingRecognition({
      sessionId, companyId, actorId: pdmUserId, roles: ["rd"], metadata, client: snapshot,
      impactToken: issueRecognitionImpactToken({ sessionId, companyId,
        sessionRowVersion: 1, impactFingerprint: "impact-one" })
    });
    expect(mocks.assertSessionScope).toHaveBeenLastCalledWith({
      sessionId, companyId, actorId: pdmUserId, principalId, privileged: true
    });
    expect(mocks.calculateImpact).toHaveBeenCalledWith({
      sessionId, companyId, expectedRowVersion: 1, lockTargets: true
    });
    expect(mocks.requirePostRelease).toHaveBeenCalledWith(snapshot, verified, true);
    expect(mocks.applyFormalization).toHaveBeenCalledWith(expect.objectContaining({
      actorId: pdmUserId, actorPrincipalId: principalId
    }));
  });

  it("records the verified Principal for inline commit and review decisions", async () => {
    mocks.commit.mockResolvedValue({ ok: true });
    mocks.execute.mockImplementationOnce(async (input) => ({
      result: await input.execute(snapshot, { roleCode: "rd" }, verified),
      reusedFromCommandReceipt: false
    }));
    await commitDrawingRecognition({
      sessionId, companyId, actorId: pdmUserId, roles: ["rd"],
      expectedRowVersion: 1, decisions: [], metadata, client: snapshot
    });
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: pdmUserId, actorPrincipalId: principalId
    }));
    await saveDrawingRecognitionDecisions({ sessionId, companyId,
      actorId: pdmUserId, principalId, roles: ["rd"],
      expectedRowVersion: 1, decisions: [], client: snapshot });
    expect(mocks.saveDecisions).toHaveBeenCalledWith(expect.objectContaining({
      actorId: pdmUserId, actorPrincipalId: principalId
    }));
  });

  it("records the verified Principal when an amendment creates a successor session", async () => {
    mocks.assertSessionScope.mockResolvedValue({
      id: sessionId, status: "formalized", row_version: 1, evidence_origin_session_id: null
    });
    mocks.getProjection.mockResolvedValue({
      sourceContextType: "drawing_number", sourceContextId: "drawing-one",
      sources: [{ fileAssetId: "file-one" }], drawingId: "drawing-one", drawingRevisionId: null
    });
    mocks.createSession.mockResolvedValue({ id: "successor-one" });
    mocks.execute.mockImplementationOnce(async (input) => ({
      result: await input.execute(snapshot, { roleCode: "rd" }, verified),
      reusedFromCommandReceipt: false
    }));
    await createDrawingRecognitionAmendment({
      sessionId, companyId, actorId: pdmUserId, roles: ["rd"],
      expectedRowVersion: 1, metadata, client: snapshot
    });
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      companyId, actorId: pdmUserId, initiatorPrincipalId: principalId,
      supersedesSessionId: sessionId, sessionPurpose: "amendment"
    }));
  });

  it("preserves the rerun initiator separately from the historical profile", async () => {
    mocks.getProjection.mockResolvedValue({
      id: sessionId, status: "review_ready", sourceContextType: "drawing_number",
      sourceContextId: "drawing-one", sources: [{ fileAssetId: "file-one" }],
      drawingId: "drawing-one", drawingRevisionId: null
    });
    mocks.createSession.mockResolvedValue({ id: "rerun-one" });
    await rerunDrawingRecognition({ sessionId, companyId, actorId: pdmUserId,
      initiatorPrincipalId: principalId, roles: ["rd"], client: snapshot });
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      companyId, actorId: pdmUserId, initiatorPrincipalId: principalId,
      supersedesSessionId: sessionId, sessionPurpose: "rerun"
    }));
  });
});
