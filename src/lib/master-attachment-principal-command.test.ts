import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PdmCommandMetadata } from "@/lib/platform-command";
const mocks = vi.hoisted(() => ({ lock: vi.fn(), command: vi.fn(), database: {} }));
vi.mock("@/lib/pdm-review-lock", async (original) => ({ ...(await original<object>()), assertPdmEntityWriteAllowedAsync: mocks.lock }));
vi.mock("@/lib/platform-command-service", () => ({ executePdmCommandWithOutbox: mocks.command }));
vi.mock("@/lib/db-async-provider", async (original) => ({ ...(await original<object>()), getAsyncDatabaseClient: () => mocks.database }));
import { AsyncMasterAttachmentRepository } from "@/lib/repositories/master-attachment-async-repository";
import { executeMasterAttachmentCommandAsync } from "@/lib/master-attachments-async";
const context = { companyId: "company-one", profileId: "profile-one", principalId: "principal-one", profileVersion: 1 };
function fixture() {
  const execute = vi.fn().mockResolvedValue(undefined);
  const queryOne = vi.fn(async (sql: string, params?: Record<string, unknown>) => {
    if (sql.includes("FROM part_numbers") && sql.includes("part_number = :code")) {
      if (!sql.includes("AND company_id = :companyId")) throw new Error("UNSCOPED_ENTITY_LOOKUP");
      return params?.companyId === "company-one" ? { id: "part-one", part_number: "SAME-CODE" } : null;
    }
    if (sql.includes("SELECT company_id FROM part_numbers")) return { company_id: "company-one" };
    if (params?.attachmentId && params.entityId === "part-one") return { id: "asset-one", file_name: "synthetic.pdf" };
    return null;
  });
  const client = { kind: "postgres", queryOne, execute } as unknown as AsyncDatabaseClient;
  const repository = new AsyncMasterAttachmentRepository(client, () => "2026-10-01T23:00:00Z", () => "audit-one", context);
  return { client, repository, execute, queryOne };
}
beforeEach(() => { vi.clearAllMocks(); mocks.lock.mockResolvedValue(undefined); });
describe("Principal attachment repository writes", () => {
  it("retains the verified security subject and company in audit; profile ID is only the domain FK", async () => {
    const f = fixture();
    await f.repository.softDeleteMasterAttachment({ entityType: "part_number", entityCode: "SAME-CODE", attachmentId: "asset-one", deletedBy: "profile-one" });
    expect(mocks.lock).toHaveBeenCalledWith(f.client, expect.objectContaining({ companyId: "company-one", targetIds: ["part-one", "asset-one"] }));
    const audit = f.execute.mock.calls.find(([sql]) => sql.includes("INSERT INTO audit_logs"))?.[1];
    expect(audit).toMatchObject({ actorId: "profile-one", companyId: "company-one", scopeKind: "tenant" });
    expect(JSON.parse(audit.detailJson)).toMatchObject({ securityActor: { principalId: "principal-one", profileVersion: 1, actorKind: "human", reason: "numbering.master_attachment.delete" }, attachmentId: "asset-one" });
  });
  it("rejects an actor/profile substitution before any query or mutation", async () => {
    const f = fixture();
    await expect(f.repository.softDeleteMasterAttachment({ entityType: "part_number", entityCode: "SAME-CODE", attachmentId: "asset-one", deletedBy: "other-profile" })).rejects.toThrow("MASTER_ATTACHMENT_ACTOR_PROFILE_MISMATCH");
    expect(f.queryOne).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  });
  it("never executes PostgreSQL writes using an unverified legacy profile actor", async () => {
    const f = fixture();
    const legacy = new AsyncMasterAttachmentRepository(f.client);
    await expect(legacy.softDeleteMasterAttachment({ entityType: "part_number", entityCode: "SAME-CODE", attachmentId: "asset-one", deletedBy: "profile-one" })).rejects.toThrow("MASTER_ATTACHMENT_PRINCIPAL_CONTEXT_REQUIRED");
    expect(f.queryOne).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled();
  });
  it("does not mutate a matching number owned by another company", async () => {
    const f = fixture();
    const wrongCompany = new AsyncMasterAttachmentRepository(f.client, undefined, undefined, { ...context, companyId: "company-two" });
    await expect(wrongCompany.softDeleteMasterAttachment({ entityType: "part_number", entityCode: "SAME-CODE", attachmentId: "asset-one", deletedBy: "profile-one" })).rejects.toThrow("MASTER_ATTACHMENT_ENTITY_NOT_FOUND");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("preserves the domain review lock refusal", async () => {
    const f = fixture(); mocks.lock.mockRejectedValue(new Error("CANDIDATE_REVIEW_LOCKED"));
    await expect(f.repository.softDeleteMasterAttachment({ entityType: "part_number", entityCode: "SAME-CODE", attachmentId: "asset-one", deletedBy: "profile-one" })).rejects.toThrow("CANDIDATE_REVIEW_LOCKED");
    expect(f.execute).not.toHaveBeenCalled();
  });
});
const metadata = {
  actor: { principalId: "principal-one", pdmUserId: "profile-one", organizationId: "company-one", requestId: "request-one", correlationId: "request-one", roles: ["rd"], scopes: ["numbering.attachments.manage"], authProvider: "current_pdm_session", platformOrganizationId: null, authorizationActor: { sessionSchemaVersion: 2 } },
  idempotencyKey: "operation-one", principalRequest: { token: "not-a-live-token" },
  principalAuthorization: { permissionCode: "numbering.attachments.manage", method: "DELETE" }
} as unknown as PdmCommandMetadata;
describe("attachment commands retain the established transaction/outbox owner", () => {
  it("passes the same verified request, exact permission and canonical principal to the command engine", async () => {
    mocks.command.mockResolvedValue({ result: { deleted: true }, reusedFromCommandReceipt: false });
    expect(await executeMasterAttachmentCommandAsync({ kind: "delete", entityType: "part_number", entityCode: "SAME-CODE", attachmentId: "asset-one" }, metadata)).toEqual({ deleted: true });
    const call = mocks.command.mock.calls[0][0];
    expect(call.principalRequest).toBe(metadata.principalRequest);
    expect(call.principalAuthorization).toBe(metadata.principalAuthorization);
    expect(call.command.actor.principalId).toBe("principal-one");
    expect(call.command.commandName).toBe("pdm.master_attachment.delete");
    expect(call.serializable).toBe(true);
    expect(call.event()).toMatchObject({ aggregateType: "master_attachment", aggregateId: "asset-one" });
  });
  it("rejects missing command-time Principal verification rather than synthesizing a local actor", async () => {
    await expect(executeMasterAttachmentCommandAsync({ kind: "delete", entityType: "part_number", entityCode: "SAME-CODE", attachmentId: "asset-one" }, { ...metadata, principalRequest: undefined })).rejects.toThrow("MASTER_ATTACHMENT_PRINCIPAL_CONTEXT_REQUIRED");
    expect(mocks.command).not.toHaveBeenCalled();
  });
});
