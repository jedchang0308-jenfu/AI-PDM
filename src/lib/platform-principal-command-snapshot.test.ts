import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import type { PrincipalWorkspacePermission } from "@/lib/jenfu-principal-permission-service";
import { createPdmCommand, createPlatformActorContext, type PdmCommand } from "@/lib/platform-command";

const mocks = vi.hoisted(() => ({
  withRequest: vi.fn(),
  evaluate: vi.fn(),
  requireActive: vi.fn(),
  findOrganization: vi.fn(),
  findCompleted: vi.fn(),
  claim: vi.fn(),
  enqueue: vi.fn(),
  complete: vi.fn(),
  getActiveAttachment: vi.fn(),
  listDeletedAttachments: vi.fn(),
  resolveCompanyEntity: vi.fn(),
  attachmentSnapshot: vi.fn(),
  attachmentContext: vi.fn(),
  dynamicPolicy: vi.fn()
}));

vi.mock("@/lib/jenfu-principal-request-guard", () => ({
  withVerifiedJenfuPrincipalRequest: mocks.withRequest
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/jenfu-principal-account-repository", () => ({
  JenfuPrincipalAccountRepository: class {
    requireActive = mocks.requireActive;
  }
}));
vi.mock("@/lib/repositories/platform-mapping-async-repository", () => ({
  PlatformMappingAsyncRepository: class {
    findCurrentOrganization = mocks.findOrganization;
  }
}));
vi.mock("@/lib/repositories/platform-outbox-async-repository", () => ({
  PlatformOutboxAsyncRepository: class {
    findCompletedCommand = mocks.findCompleted;
    claimCommand = mocks.claim;
    enqueue = mocks.enqueue;
    completeCommand = mocks.complete;
  }
}));
vi.mock("@/lib/repositories/master-attachment-async-repository", () => ({
  AsyncMasterAttachmentRepository: class {
    constructor(snapshot: AsyncDatabaseClient, _clock: unknown, _idFactory: unknown, context: unknown) {
      mocks.attachmentSnapshot(snapshot);
      mocks.attachmentContext(context);
    }
    getMasterAttachmentInCompany = mocks.getActiveAttachment;
    listDeletedMasterAttachmentsInCompany = mocks.listDeletedAttachments;
    resolveCompanyEntity = mocks.resolveCompanyEntity;
  },
  normalizeMasterAttachmentCategory: (entityType: string, value: string) => {
    const categories = entityType === "drawing_number"
      ? ["cad_3d", "intermediate", "drawing_2d", "dwg", "pdf", "other"]
      : ["cad_3d", "intermediate", "catalog", "spec_sheet", "supplier_doc", "test_report", "part_preview_image", "other"];
    const normalized = value.trim();
    if (!categories.includes(normalized)) throw new Error("MASTER_ATTACHMENT_CATEGORY_INVALID");
    return normalized;
  }
}));
vi.mock("@/lib/principal-resource-capability", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/principal-resource-capability")>();
  return { ...actual, isDynamicRolePolicyInSnapshot: mocks.dynamicPolicy };
});

import { executePdmCommandWithOutbox } from "@/lib/platform-command-service";

const principalId = "principal-one";
const pdmUserId = "pdm-user-one";
const companyId = "company-one";
const verified = {
  profile: { pdmUserId, companyId },
  session: {
    contractVersion: "jenfu.ai-pdm-session.v2" as const, appId: "ai-pdm" as const,
    sessionId: "session-one", identityIssuer: "issuer", identitySubject: "subject",
    principalId, employeeId: "employee-one", authEpoch: 1,
    issuedAt: "2026-09-24T00:00:00.000Z", expiresAt: "2026-09-25T00:00:00.000Z",
    assuranceLevel: "aal2" as const
  }
};
const token = `${Buffer.from(JSON.stringify({ type: "JENFU-AI-PDM-PRINCIPAL", version: 2 }))
  .toString("base64url")}.payload.signature`;
const route = { request: new Request("https://ai-pdm.test/api/admin/accounts/pdm-user-one/lifecycle", {
  method: "POST", headers: { cookie: `pdm_session=${token}` }
}), routePath: "src/app/api/admin/accounts/[userId]/lifecycle/route.ts",
  method: "POST", permissionCode: "accounts.lifecycle.manage" };

function command(overridePrincipalId = principalId) {
  return createPdmCommand({ commandName: "pdm.test.principal-mutation",
    idempotencyKey: "operation-one",
    actor: createPlatformActorContext({ pdmUserId, organizationId: companyId,
      principalId: overridePrincipalId,
      authorizationActor: {
        identityIssuer: "issuer", identitySubject: "subject", principalId: overridePrincipalId,
        employeeId: "employee-one", localPrincipalId: pdmUserId, companyId,
        sessionSchemaVersion: 2
      } }), payload: { value: 1 } });
}

function client(isolation = "repeatable read") {
  return { kind: "postgres", queryOne: vi.fn(async (sql: string) => {
    if (sql.includes("current_setting('transaction_isolation')")) return { isolation_level: isolation };
    return null;
  }), execute: vi.fn(), query: vi.fn() } as unknown as AsyncDatabaseClient;
}

function input<TPayload = { value: number }>(database: AsyncDatabaseClient,
  mutate: (snapshot: AsyncDatabaseClient) => Promise<{ ok: boolean }> = async () => ({ ok: true }),
  commandOverride: PdmCommand<TPayload> = command() as PdmCommand<TPayload>, authorization = route) {
  return { client: database, command: commandOverride, execute: mutate,
    event: () => ({ aggregateType: "test", aggregateId: "one", eventType: "changed", payload: {} }),
    principalRequest: { token, keyRing: {} as never,
      identityIssuer: "issuer", trustPolicy: {} as never, database },
    principalAuthorization: authorization };
}

describe("principal command and mutation use one verified snapshot", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.withRequest.mockImplementation(async (_input, run, options) => {
      expect(options).toMatchObject({ readOnly: false });
      expect(["repeatable_read", "serializable"]).toContain(options.isolationLevel);
      return run(_input.database, verified);
    });
    mocks.evaluate.mockResolvedValue([{ allowed: true, principalId,
      permissionCode: route.permissionCode }]);
    mocks.requireActive.mockResolvedValue({ principalId, pdmUserId, companyId });
    mocks.findOrganization.mockResolvedValue({ mappingStatus: "active",
      platformOrganizationId: "organization-one" });
    mocks.findCompleted.mockResolvedValue({ completed: false });
    mocks.claim.mockResolvedValue(true);
    mocks.getActiveAttachment.mockResolvedValue({ id: "asset-one", entityType: "part_number", documentCategory: "spec_sheet" });
    mocks.listDeletedAttachments.mockResolvedValue({ attachments: [] });
    mocks.resolveCompanyEntity.mockResolvedValue({ entityType: "part_number", entityCode: "PN-1" });
    mocks.dynamicPolicy.mockResolvedValue(true);
  });

  it("rechecks route permission, active account and actor in the write snapshot before the command", async () => {
    const database = client();
    const mutate = vi.fn(async (snapshot: AsyncDatabaseClient) => {
      expect(snapshot).toBe(database);
      expect(mocks.evaluate).toHaveBeenCalledWith(database, verified,
        [{ permissionKind: "action", permissionCode: route.permissionCode }]);
      expect(mocks.requireActive).toHaveBeenCalledWith(principalId);
      return { ok: true };
    });
    await expect(executePdmCommandWithOutbox(input(database, mutate))).resolves.toEqual({
      result: { ok: true }, reusedFromCommandReceipt: false
    });
    expect(mutate).toHaveBeenCalledOnce();
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(mocks.findOrganization).not.toHaveBeenCalled();
    expect(vi.mocked(database.queryOne).mock.calls.some(([sql]) =>
      String(sql).includes("read_principal_cutover_for_command_v1"))).toBe(false);
    expect(mocks.claim.mock.calls[0][0].actor.platformOrganizationId).toBeNull();
  });

  it.each([
    {
      label: "part attachment delete",
      commandName: "pdm.master_attachment.delete",
      routePath: "src/app/api/parts/[partNumber]/attachments/[attachmentId]/route.ts",
      method: "DELETE", url: "https://ai-pdm.test/api/parts/PN-1/attachments/asset-one",
      entityType: "part_number" as const, entityCode: "PN-1", category: "spec_sheet", groups: ["part"], deleted: false
    },
    {
      label: "part attachment restore uses deleted row CAD category",
      commandName: "pdm.master_attachment.restore",
      routePath: "src/app/api/parts/[partNumber]/attachments/[attachmentId]/restore/route.ts",
      method: "POST", url: "https://ai-pdm.test/api/parts/PN-1/attachments/asset-one/restore",
      entityType: "part_number" as const, entityCode: "PN-1", category: "cad_3d", groups: ["part", "model"], deleted: true
    },
    {
      label: "part preview uses the persisted intermediate category",
      commandName: "pdm.master_attachment.preview",
      routePath: "src/app/api/parts/[partNumber]/attachments/[attachmentId]/previews/route.ts",
      method: "POST", url: "https://ai-pdm.test/api/parts/PN-1/attachments/asset-one/previews",
      entityType: "part_number" as const, entityCode: "PN-1", category: "intermediate", groups: ["part", "model"], deleted: false
    },
  ])("derives $label groups from the company-bound attachment in the write snapshot", async (scenario: {
    label: string; commandName: string; routePath: string; method: string; url: string;
    entityType: "part_number" | "drawing_number"; entityCode: string; category: string;
    groups: string[]; deleted?: boolean
  }) => {
    const database = client();
    const authRoute = {
      request: new Request(scenario.url, { method: scenario.method,
        headers: { cookie: `pdm_session=${token}` } }),
      routePath: scenario.routePath, method: scenario.method,
      permissionCode: "numbering.attachments.manage"
    };
    const attachment = { id: "asset-one", entityType: scenario.entityType,
      entityCode: scenario.entityCode, documentCategory: scenario.category };
    if (scenario.deleted) mocks.listDeletedAttachments.mockResolvedValueOnce({
      attachments: [{ attachment, policy: {} }]
    });
    else mocks.getActiveAttachment.mockResolvedValueOnce(attachment);
    mocks.evaluate.mockImplementationOnce(async (_snapshot: AsyncDatabaseClient, _verified: VerifiedPrincipalRequest,
      permissions: PrincipalWorkspacePermission[]) =>
      permissions.map(permission => ({ allowed: true, principalId, permissionCode: permission.permissionCode })));
    const attachmentCommand = createPdmCommand({
      commandName: scenario.commandName, idempotencyKey: "attachment-operation",
      actor: command().actor,
      payload: { kind: scenario.commandName.slice("pdm.master_attachment.".length),
        entityType: scenario.entityType, entityCode: scenario.entityCode, attachmentId: "asset-one" }
    });
    const execute = vi.fn(async () => ({ ok: true }));
    await expect(executePdmCommandWithOutbox({
      ...input(database, execute, attachmentCommand, authRoute), execute
    })).resolves.toMatchObject({ result: { ok: true }, reusedFromCommandReceipt: false });
    expect(mocks.attachmentSnapshot).toHaveBeenCalledWith(database);
    expect(mocks.attachmentContext).toHaveBeenCalledWith({ companyId, principalId,
      profileId: pdmUserId, profileVersion: undefined });
    const parentGroup = scenario.entityType === "drawing_number" ? "drawing" : "part";
    const expectedPermissions: PrincipalWorkspacePermission[] = [{ permissionKind: "action", permissionCode: "numbering.attachments.manage",
      resourceGroups: [parentGroup] }];
    if (scenario.groups.includes("model")) expectedPermissions.push({
      permissionKind: "action", permissionCode: "pdm.model.edit"
    });
    expect(mocks.evaluate).toHaveBeenCalledWith(database, verified, expectedPermissions);
    expect(scenario.deleted ? mocks.listDeletedAttachments : mocks.getActiveAttachment).toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
  });

  it.each([
    { requestedCategory: " cad_3d ", normalizedCategory: "cad_3d", groups: ["part", "model"] },
    { requestedCategory: "intermediate", normalizedCategory: "intermediate", groups: ["part", "model"] },
    { requestedCategory: "other", normalizedCategory: "other", groups: ["part"] },
    { requestedCategory: "catalog", normalizedCategory: "catalog", groups: ["part"] }
  ])("validates upload category in the command snapshot and passes that category to the writer: $requestedCategory", async scenario => {
    const database = client();
    const authRoute = {
      request: new Request("https://ai-pdm.test/api/parts/PN-1/attachments", {
        method: "POST", headers: { cookie: `pdm_session=${token}` }
      }),
      routePath: "src/app/api/parts/[partNumber]/attachments/route.ts",
      method: "POST", permissionCode: "numbering.attachments.manage"
    };
    mocks.evaluate.mockImplementationOnce(async (_snapshot: AsyncDatabaseClient, _verified: VerifiedPrincipalRequest,
      permissions: PrincipalWorkspacePermission[]) =>
      permissions.map(permission => ({ allowed: true, principalId, permissionCode: permission.permissionCode })));
    const uploadCommand = createPdmCommand({ commandName: "pdm.master_attachment.upload",
      idempotencyKey: "attachment-upload", actor: command().actor,
      payload: { entityType: "part_number", entityCode: "PN-1", documentCategory: scenario.requestedCategory } });
    const execute = vi.fn(async (_snapshot: AsyncDatabaseClient, _decision?: unknown,
      _verified?: VerifiedPrincipalRequest | null, context?: { validatedAttachmentCategory?: string }) => ({
      ok: true, category: context?.validatedAttachmentCategory
    }));
    await expect(executePdmCommandWithOutbox({
      ...input(database, execute, uploadCommand, authRoute), execute
    })).resolves.toMatchObject({ result: { ok: true, category: scenario.normalizedCategory }, reusedFromCommandReceipt: false });
    expect(mocks.resolveCompanyEntity).toHaveBeenCalledWith({ entityType: "part_number", entityCode: "PN-1", companyId });
    const expectedPermissions: PrincipalWorkspacePermission[] = [{ permissionKind: "action",
      permissionCode: "numbering.attachments.manage", resourceGroups: ["part"] }];
    if (scenario.groups.includes("model")) expectedPermissions.push({
      permissionKind: "action", permissionCode: "pdm.model.edit"
    });
    expect(mocks.evaluate).toHaveBeenCalledWith(database, verified, expectedPermissions);
    expect(execute.mock.calls[0]?.[3]).toEqual({ validatedAttachmentCategory: scenario.normalizedCategory });
  });

  it("requires model edit for CAD upload before claiming or writing the command", async () => {
    const database = client();
    const authRoute = {
      request: new Request("https://ai-pdm.test/api/parts/PN-1/attachments", {
        method: "POST", headers: { cookie: `pdm_session=${token}` }
      }),
      routePath: "src/app/api/parts/[partNumber]/attachments/route.ts",
      method: "POST", permissionCode: "numbering.attachments.manage"
    };
    mocks.evaluate.mockImplementationOnce(async (_snapshot: AsyncDatabaseClient, _verified: VerifiedPrincipalRequest,
      permissions: PrincipalWorkspacePermission[]) => permissions.map(permission => ({
      allowed: permission.permissionCode !== "pdm.model.edit", principalId, permissionCode: permission.permissionCode
    })));
    const uploadCommand = createPdmCommand({ commandName: "pdm.master_attachment.upload",
      idempotencyKey: "cad-upload-without-model-edit", actor: command().actor,
      payload: { entityType: "part_number", entityCode: "PN-1", documentCategory: "cad_3d" } });
    const execute = vi.fn(async () => ({ ok: true }));
    await expect(executePdmCommandWithOutbox({
      ...input(database, execute, uploadCommand, authRoute), execute
    })).rejects.toThrow("PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED");
    expect(mocks.evaluate).toHaveBeenCalledWith(database, verified, [
      { permissionKind: "action", permissionCode: "numbering.attachments.manage", resourceGroups: ["part"] },
      { permissionKind: "action", permissionCode: "pdm.model.edit" }
    ]);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("requires the upload parent to resolve inside the verified company snapshot", async () => {
    const database = client();
    mocks.resolveCompanyEntity.mockResolvedValueOnce(null);
    const authRoute = {
      request: new Request("https://ai-pdm.test/api/parts/PN-1/attachments", {
        method: "POST", headers: { cookie: `pdm_session=${token}` }
      }),
      routePath: "src/app/api/parts/[partNumber]/attachments/route.ts",
      method: "POST", permissionCode: "numbering.attachments.manage"
    };
    const uploadCommand = createPdmCommand({ commandName: "pdm.master_attachment.upload",
      idempotencyKey: "missing-upload-parent", actor: command().actor,
      payload: { entityType: "part_number", entityCode: "PN-1", documentCategory: "other" } });
    const execute = vi.fn(async () => ({ ok: true }));
    await expect(executePdmCommandWithOutbox({
      ...input(database, execute, uploadCommand, authRoute), execute
    })).rejects.toThrow();
    expect(mocks.evaluate).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    { label: "unknown category", entityType: "part_number", entityCode: "PN-1", documentCategory: "pdf" },
    { label: "wrong parent type", entityType: "drawing_number", entityCode: "PN-1", documentCategory: "other" },
    { label: "route parent mismatch", entityType: "part_number", entityCode: "PN-2", documentCategory: "other" }
  ])("rejects upload $label before permission or command effects", async scenario => {
    const database = client();
    const authRoute = {
      request: new Request("https://ai-pdm.test/api/parts/PN-1/attachments", {
        method: "POST", headers: { cookie: `pdm_session=${token}` }
      }),
      routePath: "src/app/api/parts/[partNumber]/attachments/route.ts",
      method: "POST", permissionCode: "numbering.attachments.manage"
    };
    const uploadCommand = createPdmCommand({ commandName: "pdm.master_attachment.upload",
      idempotencyKey: "invalid-upload-binding", actor: command().actor,
      payload: { entityType: scenario.entityType, entityCode: scenario.entityCode,
        documentCategory: scenario.documentCategory } });
    const execute = vi.fn(async () => ({ ok: true }));
    await expect(executePdmCommandWithOutbox({
      ...input(database, execute, uploadCommand, authRoute), execute
    })).rejects.toThrow(scenario.label === "unknown category"
      ? "MASTER_ATTACHMENT_CATEGORY_INVALID" : "PLATFORM_PRINCIPAL_COMMAND_RESOURCE_BINDING_INVALID");
    expect(mocks.evaluate).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails closed on an unknown persisted attachment category before permission or command effects", async () => {
    const database = client();
    mocks.getActiveAttachment.mockResolvedValueOnce({ id: "asset-one", entityType: "part_number",
      entityCode: "PN-1", documentCategory: "unregistered-category" });
    const authRoute = {
      request: new Request("https://ai-pdm.test/api/parts/PN-1/attachments/asset-one/previews", {
        method: "POST", headers: { cookie: `pdm_session=${token}` }
      }),
      routePath: "src/app/api/parts/[partNumber]/attachments/[attachmentId]/previews/route.ts",
      method: "POST", permissionCode: "numbering.attachments.manage"
    };
    const attachmentCommand = createPdmCommand({ commandName: "pdm.master_attachment.preview",
      idempotencyKey: "unknown-category", actor: command().actor,
      payload: { kind: "preview", entityType: "part_number", entityCode: "PN-1", attachmentId: "asset-one" } });
    const execute = vi.fn(async () => ({ ok: true }));
    await expect(executePdmCommandWithOutbox({
      ...input(database, execute, attachmentCommand, authRoute), execute
    })).rejects.toThrow("MASTER_ATTACHMENT_CATEGORY_INVALID");
    expect(mocks.evaluate).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("requires pdm.model.edit for a persisted CAD attachment before command effects", async () => {
    const database = client();
    mocks.getActiveAttachment.mockResolvedValueOnce({ id: "asset-one", entityType: "part_number",
      entityCode: "PN-1", documentCategory: "cad_3d" });
    mocks.evaluate.mockImplementationOnce(async (_snapshot, _verified, permissions) =>
      permissions.map((permission: {permissionCode: string}) => ({ allowed: permission.permissionCode !== "pdm.model.edit",
        principalId, permissionCode: permission.permissionCode })));
    const authRoute = {
      request: new Request("https://ai-pdm.test/api/parts/PN-1/attachments/asset-one/previews", {
        method: "POST", headers: { cookie: `pdm_session=${token}` }
      }),
      routePath: "src/app/api/parts/[partNumber]/attachments/[attachmentId]/previews/route.ts",
      method: "POST", permissionCode: "numbering.attachments.manage"
    };
    const attachmentCommand = createPdmCommand({ commandName: "pdm.master_attachment.preview",
      idempotencyKey: "cad-without-model-edit", actor: command().actor,
      payload: { kind: "preview", entityType: "part_number", entityCode: "PN-1", attachmentId: "asset-one" } });
    const execute = vi.fn(async () => ({ ok: true }));
    await expect(executePdmCommandWithOutbox({
      ...input(database, execute, attachmentCommand, authRoute), execute
    })).rejects.toThrow("PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED");
    expect(mocks.evaluate).toHaveBeenCalledWith(database, verified, [
      { permissionKind: "action", permissionCode: "numbering.attachments.manage", resourceGroups: ["part"] },
      { permissionKind: "action", permissionCode: "pdm.model.edit" }
    ]);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps the legacy catalog attachment permission and write path unchanged", async () => {
    const database = client();
    mocks.dynamicPolicy.mockResolvedValueOnce(false);
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true, principalId,
      permissionCode: "numbering.attachments.manage" }]);
    const authRoute = {
      request: new Request("https://ai-pdm.test/api/parts/PN-1/attachments/asset-one", {
        method: "DELETE", headers: { cookie: `pdm_session=${token}` }
      }),
      routePath: "src/app/api/parts/[partNumber]/attachments/[attachmentId]/route.ts",
      method: "DELETE", permissionCode: "numbering.attachments.manage"
    };
    const attachmentCommand = createPdmCommand({ commandName: "pdm.master_attachment.delete",
      idempotencyKey: "legacy-attachment-delete", actor: command().actor,
      payload: { kind: "delete", entityType: "part_number", entityCode: "PN-1", attachmentId: "asset-one" } });
    const execute = vi.fn(async () => ({ ok: true }));
    await expect(executePdmCommandWithOutbox({
      ...input(database, execute, attachmentCommand, authRoute), execute
    })).resolves.toMatchObject({ result: { ok: true } });
    expect(mocks.getActiveAttachment).not.toHaveBeenCalled();
    expect(mocks.listDeletedAttachments).not.toHaveBeenCalled();
    expect(mocks.evaluate).toHaveBeenCalledWith(database, verified, [{
      permissionKind: "action", permissionCode: "numbering.attachments.manage"
    }]);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("allows only exact Principal-bound submission-share create with company and Released-package checks", async () => {
    const database = client();
    const queryOne = vi.mocked(database.queryOne);
    queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes("current_setting('transaction_isolation')")) return { isolation_level: "serializable" } as never;
      if (sql.includes("FROM ai_pdm_core.submissions")) {
        return { id: "submission-one", company_id: companyId, status: "Released" } as never;
      }
      if (sql.includes("ai_pdm_core.release_packages")) return { id: "package-one" } as never;
      return null;
    });
    const shareRoute = {
      request: new Request("https://ai-pdm.test/api/submissions/submission-one/shares", {
        method: "POST", headers: { cookie: `pdm_session=${token}` }
      }),
      routePath: "src/app/api/submissions/[id]/shares/route.ts",
      method: "POST", permissionCode: "submission.share",
      resourceBinding: { kind: "submission_share" as const, submissionId: "submission-one" }
    };
    const shareCommand = createPdmCommand({ commandName: "pdm.submission_share.create",
      idempotencyKey: "share-create-one", actor: command().actor,
      payload: { submissionId: "submission-one", label: "Review", days: 14 } });
    const execute = vi.fn(async (_snapshot: AsyncDatabaseClient, _decision: unknown,
      verifiedRequest: VerifiedPrincipalRequest | null) => {
      expect(verifiedRequest).toBe(verified);
      return { shareId: "share-one" };
    });
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true, principalId,
      permissionCode: "submission.share" }]);
    await expect(executePdmCommandWithOutbox({
      ...input(database), command: shareCommand, principalAuthorization: shareRoute,
      execute, serializable: true
    })).resolves.toMatchObject({ result: { shareId: "share-one" }, reusedFromCommandReceipt: false });
    expect(queryOne.mock.calls.some(([sql, params]) => String(sql).includes("FROM ai_pdm_core.submissions") &&
      (params as Record<string, unknown>).companyId === companyId)).toBe(true);
    expect(queryOne.mock.calls.some(([sql]) => String(sql).includes("ai_pdm_core.release_packages"))).toBe(true);
    expect(mocks.evaluate).toHaveBeenCalledWith(database, verified,
      [{ permissionKind: "action", permissionCode: "submission.share" }]);
    expect(mocks.claim).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
  });

  it("rejects a forged submission-share binding before resource access or effects", async () => {
    const database = client();
    const queryOne = vi.mocked(database.queryOne);
    const shareRoute = {
      request: new Request("https://ai-pdm.test/api/submissions/submission-one/shares", {
        method: "POST", headers: { cookie: `pdm_session=${token}` }
      }),
      routePath: "src/app/api/submissions/[id]/shares/route.ts",
      method: "POST", permissionCode: "submission.share",
      resourceBinding: { kind: "submission_share" as const, submissionId: "other-submission" }
    };
    const shareCommand = createPdmCommand({ commandName: "pdm.submission_share.create",
      idempotencyKey: "share-create-forged", actor: command().actor,
      payload: { submissionId: "other-submission", label: "Review", days: 14 } });
    const execute = vi.fn(async () => ({ shareId: "unexpected" }));
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true, principalId,
      permissionCode: "submission.share" }]);
    await expect(executePdmCommandWithOutbox({
      ...input(database), command: shareCommand, principalAuthorization: shareRoute,
      execute, serializable: true
    })).rejects.toThrow("PLATFORM_PRINCIPAL_COMMAND_RESOURCE_BINDING_INVALID");
    expect(queryOne.mock.calls.filter(([sql]) => !String(sql).includes("current_setting('transaction_isolation')"))).toHaveLength(0);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("passes the verified principal into resource-specific authorization in that snapshot", async () => {
    const database = client();
    const execute = vi.fn(async (snapshot: AsyncDatabaseClient, _decision: unknown,
      verifiedRequest: VerifiedPrincipalRequest | null) => {
      expect(snapshot).toBe(database);
      expect(verifiedRequest).toBe(verified);
      return { ok: true };
    });
    await expect(executePdmCommandWithOutbox({ ...input(database), execute }))
      .resolves.toMatchObject({ result: { ok: true } });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("recognizes the exact recognition formalization route before writing", async () => {
    const database = client();
    const recognitionRoute = {
      request: new Request("https://ai-pdm.test/api/numbering/recognition-sessions/recognition-one/formalize", {
        method: "POST", headers: { cookie: `pdm_session=${token}` }
      }),
      routePath: "src/app/api/numbering/recognition-sessions/[sessionId]/formalize/route.ts",
      method: "POST", permissionCode: "numbering.recognition.formalize"
    };
    const recognitionCommand = createPdmCommand({
      commandName: "drawing_recognition.formalize.v1", idempotencyKey: "recognition-one",
      actor: command().actor, payload: { sessionId: "recognition-one" }
    });
    const mutate = vi.fn(async () => ({ ok: true }));
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true, principalId,
      permissionCode: recognitionRoute.permissionCode }]);
    await expect(executePdmCommandWithOutbox({
      ...input(database, mutate), command: recognitionCommand,
      principalAuthorization: recognitionRoute
    })).resolves.toMatchObject({ result: { ok: true } });
    expect(mocks.evaluate).toHaveBeenCalledWith(database, verified,
      [{ permissionKind: "action", permissionCode: "numbering.recognition.formalize" }]);
    expect(mutate).toHaveBeenCalledOnce();
  });

  it("rechecks drawing creation's second capability in the same write snapshot", async () => {
    const database = client();
    const drawingRoute = {
      request: new Request("https://ai-pdm.test/api/numbering/records", {
        method: "POST", headers: { cookie: `pdm_session=${token}` }
      }),
      routePath: "src/app/api/numbering/records/route.ts", method: "POST",
      permissionCode: "numbering.create", additionalPermissionCodes: ["numbering.link_variant"]
    };
    const drawingCommand = createPdmCommand({
      commandName: "pdm.numbering.create_official_record", idempotencyKey: "drawing-one",
      actor: command().actor,
      payload: { drawingPurposeCode: "M" }
    });
    const mutate = vi.fn(async () => ({ ok: true }));
    const request = { ...input(database, mutate), command: drawingCommand,
      principalAuthorization: drawingRoute };
    mocks.evaluate.mockImplementation(async (_client, _verified, permissions) => permissions.map(
      (permission: { permissionCode: string }) => ({ allowed: true, principalId,
        permissionCode: permission.permissionCode })));
    await expect(executePdmCommandWithOutbox(request)).resolves.toMatchObject({
      result: { ok: true }
    });
    expect(mocks.evaluate).toHaveBeenCalledWith(database, verified, [
      { permissionKind: "action", permissionCode: "numbering.create" },
      { permissionKind: "action", permissionCode: "numbering.link_variant" }
    ]);
    expect(mutate).toHaveBeenCalledOnce();

    mutate.mockClear();
    await expect(executePdmCommandWithOutbox({ ...request,
      principalAuthorization: { ...drawingRoute, additionalPermissionCodes: [] } }))
      .rejects.toThrow("PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID");
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each([
    ["append_drawing", "drawings", { linkPartNumber: "P-1", linkRelationType: "auto" }],
    ["append_part", "parts", { linkDrawingNumber: "D-1", linkRelationType: "reference" }],
    ["append_drawing_part", "drawing-part", { linkRelationType: "auto" }]
  ] as const)("requires and rechecks link_variant for %s in the write snapshot", async (
    commandSuffix, pathSuffix, payload
  ) => {
    const database = client();
    const appendRoute = {
      request: new Request("https://ai-pdm.test/api/numbering/roots/R-1/" + pathSuffix, {
        method: "POST", headers: { cookie: "pdm_session=" + token }
      }),
      routePath: "src/app/api/numbering/roots/[rootCode]/" + pathSuffix + "/route.ts",
      method: "POST", permissionCode: "numbering.create",
      additionalPermissionCodes: ["numbering.link_variant"]
    };
    const appendCommand = createPdmCommand({
      commandName: "pdm.numbering." + commandSuffix,
      idempotencyKey: "append-" + commandSuffix,
      actor: command().actor, payload
    });
    const mutate = vi.fn(async () => ({ ok: true }));
    mocks.evaluate.mockImplementation(async (_client, _verified, permissions) => permissions.map(
      (permission: { permissionCode: string }) => ({
        allowed: true, principalId, permissionCode: permission.permissionCode
      })));
    const request = { ...input(database, mutate), command: appendCommand,
      principalAuthorization: appendRoute };
    await expect(executePdmCommandWithOutbox(request)).resolves.toMatchObject({
      result: { ok: true }
    });
    expect(mocks.evaluate).toHaveBeenCalledWith(database, verified, [
      { permissionKind: "action", permissionCode: "numbering.create" },
      { permissionKind: "action", permissionCode: "numbering.link_variant" }
    ]);
    expect(mutate).toHaveBeenCalledOnce();

    mutate.mockClear();
    await expect(executePdmCommandWithOutbox({ ...request,
      principalAuthorization: { ...appendRoute, additionalPermissionCodes: [] } }))
      .rejects.toThrow("PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID");
    expect(mutate).not.toHaveBeenCalled();

    mocks.evaluate.mockImplementation(async (_client, _verified, permissions) => permissions.map(
      (permission: { permissionCode: string }) => ({
        allowed: permission.permissionCode !== "numbering.link_variant",
        principalId, permissionCode: permission.permissionCode
      })));
    await expect(executePdmCommandWithOutbox(request))
      .rejects.toThrow("PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("does not require link_variant for an append without a relation", async () => {
    const database = client();
    const noLinkRoute = {
      request: new Request("https://ai-pdm.test/api/numbering/roots/R-1/parts", {
        method: "POST", headers: { cookie: "pdm_session=" + token }
      }),
      routePath: "src/app/api/numbering/roots/[rootCode]/parts/route.ts",
      method: "POST", permissionCode: "numbering.create", additionalPermissionCodes: []
    };
    const noLinkCommand = createPdmCommand({
      commandName: "pdm.numbering.append_part", idempotencyKey: "append-no-link",
      actor: command().actor, payload: { linkDrawingNumber: "D-1", linkRelationType: "none" }
    });
    const mutate = vi.fn(async () => ({ ok: true }));
    mocks.evaluate.mockResolvedValue([{ allowed: true, principalId,
      permissionCode: "numbering.create" }]);
    await expect(executePdmCommandWithOutbox({ ...input(database, mutate),
      command: noLinkCommand, principalAuthorization: noLinkRoute }))
      .resolves.toMatchObject({ result: { ok: true } });
    expect(mocks.evaluate).toHaveBeenCalledWith(database, verified, [
      { permissionKind: "action", permissionCode: "numbering.create" }
    ]);
  });

  it("never sends a v2 principal command when the active account check fails", async () => {
    const database = client();
    mocks.requireActive.mockRejectedValueOnce(new Error("principal_account_unavailable"));
    const mutate = vi.fn(async () => ({ ok: true }));
    await expect(executePdmCommandWithOutbox(input(database, mutate)))
      .rejects.toThrow("principal_account_unavailable");
    expect(mutate).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.findOrganization).not.toHaveBeenCalled();
  });

  it("does not repeat a completed command whose result is null", async () => {
    const database = client();
    const mutate = vi.fn(async () => ({ ok: true }));
    mocks.findCompleted.mockResolvedValue({ completed: true, result: null });
    await expect(executePdmCommandWithOutbox(input(database, mutate))).resolves.toEqual({
      result: null, reusedFromCommandReceipt: true
    });
    expect(mutate).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it.each([
    ["permission denied", "repeatable read", false, route, "PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED"],
    ["read committed", "read committed", true, route, "PLATFORM_PRINCIPAL_COMMAND_SNAPSHOT_REQUIRED"],
    ["wrong route permission", "repeatable read", true,
      { ...route, permissionCode: "numbering.create" }, "PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID"],
    ["read route used for a mutation", "repeatable read", true,
      { request: new Request("https://ai-pdm.test/api/admin/account-invitations", {
          headers: { cookie: `pdm_session=${token}` }
        }), routePath: "src/app/api/admin/account-invitations/route.ts", method: "GET",
        permissionCode: "accounts.invitation.manage" }, "PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID"]
  ])("rejects %s without mutating", async (_case, isolation, allowed, authorization, failure) => {
    const database = client(isolation);
    const mutate = vi.fn(async () => ({ ok: true }));
    mocks.evaluate.mockResolvedValue([{ allowed }]);
    await expect(executePdmCommandWithOutbox({ ...input(database, mutate),
      principalAuthorization: authorization })).rejects.toThrow(failure);
    expect(mutate).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("rejects a principal request attached to a legacy actor before selecting a writer", async () => {
    const database = client();
    const mutate = vi.fn(async () => ({ ok: true }));
    const legacyActor = createPlatformActorContext({ pdmUserId, organizationId: companyId,
      principalId, authorizationActor: {
        identityIssuer: "issuer", identitySubject: "subject", principalId,
        employeeId: "employee-one", localPrincipalId: pdmUserId, companyId
      } });
    await expect(executePdmCommandWithOutbox({ ...input(database, mutate),
      command: createPdmCommand({ commandName: "pdm.test.principal-mutation",
        idempotencyKey: "operation-one", actor: legacyActor, payload: { value: 1 } })
    })).rejects.toThrow("PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID");
    expect(mocks.withRequest).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each([
    ["another route", new Request("https://ai-pdm.test/api/admin/accounts/other", {
      method: "POST", headers: { cookie: `pdm_session=${token}` }
    })],
    ["another cookie", new Request("https://ai-pdm.test/api/admin/accounts/pdm-user-one/lifecycle", {
      method: "POST", headers: { cookie: "pdm_session=other" }
    })]
  ])("rejects a command context from %s", async (_case, request) => {
    const database = client();
    const mutate = vi.fn(async () => ({ ok: true }));
    await expect(executePdmCommandWithOutbox({ ...input(database, mutate),
      principalAuthorization: { ...route, request } })).rejects.toThrow(
      "PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID");
    expect(mutate).not.toHaveBeenCalled();
  });
});
