import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { createPlatformActorContext, type PdmCommandMetadata } from "@/lib/platform-command";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), evaluate: vi.fn(), policy: vi.fn(), token: vi.fn() }));
vi.mock("@/lib/jenfu-principal-request-guard", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: mocks.verify
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/jenfu-route-permission-map", () => ({ resolveJenfuRoutePolicy: mocks.policy }));
vi.mock("@/lib/jenfu-principal-http", () => ({ principalSessionTokenFromRequest: mocks.token }));

import { withPrincipalDrawingRecognitionMutation } from "@/lib/drawing-recognition-principal-mutation";

const principalId = "principal-one";
const actorId = "profile-one";
const companyId = "company-one";
const permissionCode = "numbering.recognition.review";
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
  actor, idempotencyKey: "recognition-direct-write-one",
  principalRequest: { token: "verified-token" } as PdmCommandMetadata["principalRequest"],
  principalAuthorization: {
    request: new Request("https://ai-pdm.test/api/numbering/recognition-sessions/recognition-one/decisions", { method: "PATCH" }),
    routePath: "src/app/api/numbering/recognition-sessions/[sessionId]/decisions/route.ts",
    method: "PATCH", permissionCode
  }
};

function run(execute = vi.fn(async () => "written"), suppliedMetadata = metadata) {
  return { execute, result: withPrincipalDrawingRecognitionMutation({
    metadata: suppliedMetadata, permissionCode, actorId, companyId, client: snapshot, execute
  }) };
}

describe("direct recognition writes share the verified Principal write snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("verified-token");
    mocks.policy.mockReturnValue({ authorizationMode: "permission", scopeResolver: "workspace" });
    mocks.verify.mockImplementation(async (_input, callback) => callback(snapshot, verified));
    mocks.evaluate.mockResolvedValue([{ allowed: true, principalId, permissionCode, roleCode: "rd" }]);
  });

  it("passes the same transaction and current published decision to the business write", async () => {
    const { execute, result } = run();
    await expect(result).resolves.toBe("written");
    expect(mocks.verify).toHaveBeenCalledWith(expect.objectContaining({
      token: "verified-token", database: snapshot
    }), expect.any(Function), { readOnly: false, isolationLevel: "repeatable_read" });
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, verified,
      [{ permissionKind: "action", permissionCode }]);
    expect(execute).toHaveBeenCalledWith(snapshot, expect.objectContaining({
      allowed: true, principalId, permissionCode
    }), verified);
  });

  it("stops a revoked grant before invoking the business write", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: false, principalId, permissionCode, roleCode: null }]);
    const { execute, result } = run();
    await expect(result).rejects.toMatchObject({ code: "RECOGNITION_PERMISSION_DENIED", status: 403 });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a mismatched verified profile before checking grants", async () => {
    mocks.verify.mockImplementationOnce(async (_input, callback) => callback(snapshot, {
      ...verified, profile: { ...verified.profile, pdmUserId: "other-profile" }
    }));
    const { execute, result } = run();
    await expect(result).rejects.toMatchObject({ code: "RECOGNITION_VERIFIED_ACTOR_MISMATCH", status: 403 });
    expect(mocks.evaluate).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects route or session-token substitution before opening the write snapshot", async () => {
    mocks.token.mockReturnValueOnce("other-token");
    const { execute, result } = run();
    await expect(result).rejects.toMatchObject({ code: "RECOGNITION_REQUEST_PROOF_INVALID", status: 403 });
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
  it.each(["pdm_admin","system_admin"])("admits %s with an intact v2 actor and exact collection POST proof",async roleCode=>{
    const permissionCode="numbering.recognition.run";
    const adminActor=createPlatformActorContext({pdmUserId:actorId,organizationId:companyId,
      roles:[roleCode],authorizationActor:actor.authorizationActor});
    expect(Object.keys(adminActor)).not.toContain("authorizationActor");
    expect(adminActor.authorizationActor?.sessionSchemaVersion).toBe(2);
    const adminMetadata={...metadata,actor:adminActor,principalAuthorization:{
      request:new Request("https://ai-pdm.test/api/numbering/recognition-sessions",{method:"POST"}),
      routePath:"src/app/api/numbering/recognition-sessions/route.ts",method:"POST",permissionCode}};
    mocks.evaluate.mockResolvedValueOnce([{allowed:true,principalId,permissionCode,roleCode}]);
    const execute=vi.fn(async()=>"written");
    await expect(withPrincipalDrawingRecognitionMutation({metadata:adminMetadata,permissionCode,actorId,companyId,client:snapshot,execute})).resolves.toBe("written");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(mocks.verify).toHaveBeenCalledWith(expect.objectContaining({database:snapshot}),expect.any(Function),
      {readOnly:false,isolationLevel:"repeatable_read"});
  });
  it.each(["route","method","missing_actor_proof"])("rejects %s before opening a write snapshot",async variant=>{
    const copy={...metadata,principalAuthorization:{...metadata.principalAuthorization!}};
    if(variant==="route") copy.principalAuthorization.request=new Request("https://ai-pdm.test/api/numbering/recognition-sessions/recognition-one/reruns",{method:"PATCH"});
    if(variant==="method") copy.principalAuthorization.method="DELETE";
    if(variant==="missing_actor_proof") copy.actor={...actor};
    const {execute,result}=run(vi.fn(async()=>"written"),copy);
    await expect(result).rejects.toMatchObject({code:"RECOGNITION_REQUEST_PROOF_INVALID",status:403});
    expect(mocks.verify).not.toHaveBeenCalled();expect(execute).not.toHaveBeenCalled();
  });
  it("does not authorize a legacy Admin role label without a current published grant",async()=>{
    const legacyMetadata={...metadata,actor:createPlatformActorContext({pdmUserId:actorId,
      organizationId:companyId,roles:["Admin"],authorizationActor:actor.authorizationActor})};
    mocks.evaluate.mockResolvedValueOnce([{allowed:false,principalId,permissionCode,roleCode:null}]);
    const {execute,result}=run(vi.fn(async()=>"written"),legacyMetadata);
    await expect(result).rejects.toMatchObject({code:"RECOGNITION_PERMISSION_DENIED",status:403});
    expect(execute).not.toHaveBeenCalled();
  });

});
