import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlatformActorContext } from "@/lib/platform-command";
import { createAsyncDatabaseClient } from "@/lib/db-async-provider";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncApprovalPlatformRepository } from "@/lib/repositories/approval-platform-async-repository";
import { principalCommandRouteMatches } from "@/lib/principal-command-route-proof";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), evaluate: vi.fn() }));
vi.mock("@/lib/jenfu-principal-request-guard", () => ({
  withVerifiedJenfuPrincipalRequest: mocks.verify
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/repositories/pdm-principal-reviewer-selector", () => ({
  selectPrincipalReviewerIdentityInSnapshot: vi.fn(async () => ({
    principalId: "principal-reviewer", profileId: "profile-reviewer"
  }))
}));

import { buildTransferPackageReadiness, officialItemSnapshot, decideTransferPackageReview, submitTransferPackageReview } from "@/lib/transfer-package-phase1d";

const url = process.env.PDM_DEV121_TRANSFER_POSTGRES_URL;
const phase = process.env.PDM_DEV121_TRANSFER_PHASE;
const database = url ? createAsyncDatabaseClient({
  kind: "postgres", connectionString: url, searchPath: "ai_pdm_core,pg_catalog", maxConnections: 1
}) : null;
const companyId = "company-jenfu";
const requestId = "APR-TRF-00000000-0000-4000-8000-000000000002";
const token = `${Buffer.from(JSON.stringify({ type: "JENFU-AI-PDM-PRINCIPAL", version: 2 }))
  .toString("base64url")}.payload.signature`;
const request = new Request(`https://ai-pdm.test/api/approvals/requests/${requestId}/decisions`, {
  method: "POST", headers: { cookie: `pdm_session=${token}` }
});
const actor = createPlatformActorContext({
  pdmUserId: "profile-reviewer", organizationId: companyId,
  principalId: "principal-reviewer", roles: ["R&D Manager"],
  authorizationActor: {
    identityIssuer: "issuer-legacy", identitySubject: "subject-legacy",
    principalId: "principal-reviewer", employeeId: "employee-reviewer",
    localPrincipalId: "profile-reviewer", companyId, sessionSchemaVersion: 2
  }
});
const ownerActor = createPlatformActorContext({
  pdmUserId: "profile-owner", organizationId: companyId,
  principalId: "principal-owner", roles: ["R&D"],
  authorizationActor: {
    identityIssuer: "issuer-legacy", identitySubject: "subject-owner",
    principalId: "principal-owner", employeeId: "employee-owner",
    localPrincipalId: "profile-owner", companyId, sessionSchemaVersion: 2
  }
});
const metadata = { actor, idempotencyKey: "transfer-decision-pg",
  principalRequest: { token, keyRing: {} as never, identityIssuer: "issuer-legacy",
    trustPolicy: {} as never, database: database! },
  principalAuthorization: { request,
    routePath: "src/app/api/approvals/requests/[requestId]/decisions/route.ts",
    method: "POST", permissionCode: "approval.request.decide",
    discriminator: "approval_decision:transfer_package" as const }
};
const decision = {
  allowed: true, principalId: "principal-reviewer",
  permissionCode: "approval.request.decide", roleCode: "rd_manager"
};

afterAll(async () => { await database?.close(); });

describe.skipIf(!database || phase !== "inbox")("Principal transfer inbox PostgreSQL contract", () => {
  const inbox = (overrides = {}) => new AsyncApprovalPlatformRepository(database!).listPrincipalWorkReviewInbox({
    companyId, actorId: "profile-reviewer", principalId: "principal-reviewer",
    domainCode: "transfer", status: "active", limit: 10, ...overrides
  });
  it("uses the read-only runtime and returns only the assigned request", async () => {
    expect((await database!.queryOne<{ current_user: string }>(
      "SELECT current_user"))?.current_user).toBe("dev121_transfer_runtime");
    const page = await inbox();
    expect(page.items.map((item) => item.packageId)).toEqual(["package-one"]);
    await expect(database!.execute("UPDATE transfer_packages SET package_status='Draft'"))
      .rejects.toMatchObject({ code: "42501" });
  });
  it("hides the request from a different Principal, profile or company", async () => {
    for (const overrides of [{ principalId: "principal-other" },
      { actorId: "profile-other" }, { companyId: "company-other" }]) {
      expect((await inbox(overrides)).items).toEqual([]);
    }
  });
  it("excludes tampered snapshots and closed requests", async () => {
    const fixtures = await database!.query<{ id: string; request_status: string;
      review_snapshot_hash: string }>(`SELECT request.id,request.request_status,
        package.review_snapshot_hash FROM approval_platform_requests request
        JOIN transfer_packages package ON package.review_request_id=request.id
        WHERE package.id IN ('package-tampered','package-closed') ORDER BY package.id`);
    expect(fixtures).toHaveLength(2);
    expect(fixtures.some((row) => row.request_status === "approved")).toBe(true);
    expect(fixtures.some((row) => row.review_snapshot_hash === "snapshot-other")).toBe(true);
    expect((await inbox()).items.map((item) => item.packageId)).toEqual(["package-one"]);
  });
});

describe.skipIf(!database || phase !== "decision")("Principal transfer decision PostgreSQL transaction", () => {
  beforeEach(() => {
    mocks.verify.mockImplementation(async (input, evaluate, options) =>
      input.database.transaction((client: AsyncDatabaseClient) => evaluate(client, {
        profile: { pdmUserId: "profile-reviewer", companyId },
        session: { contractVersion: "jenfu.ai-pdm-session.v2", appId: "ai-pdm",
          sessionId: "session-reviewer", identityIssuer: "issuer-legacy",
          identitySubject: "subject-legacy", principalId: "principal-reviewer",
          employeeId: "employee-reviewer", authEpoch: 1, profileVersion: 1,
          issuedAt: "2026-09-29T00:00:00.000Z", expiresAt: "2026-09-30T00:00:00.000Z",
          assuranceLevel: "aal2" }
      }), options));
    mocks.evaluate.mockResolvedValue([decision]);
  });

  it("rejects a wrong Principal without a decision or event", async () => {
    await database!.execute(`UPDATE approval_platform_requests
      SET payload_json = jsonb_set(payload_json, '{reviewer,principalId}', '"principal-other"')
      WHERE id = :requestId`, { requestId });
    await expect(decideTransferPackageReview({ metadata, requestId,
      decision: "approved", comment: null })).rejects.toMatchObject({
      code: "TRANSFER_REVIEWER_NOT_ASSIGNED", status: 403
    });
    const rows = await database!.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM approval_platform_decisions WHERE request_id = :requestId",
      { requestId });
    expect(rows[0].count).toBe("0");
    expect((await database!.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM platform_command_receipts"))[0].count).toBe("0");
    await database!.execute(`UPDATE approval_platform_requests
      SET payload_json = jsonb_set(payload_json, '{reviewer,principalId}', '"principal-reviewer"')
      WHERE id = :requestId`, { requestId });
  });

  it("does not claim a command or write an event after permission revocation", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ ...decision, allowed: false }]);
    await expect(decideTransferPackageReview({ metadata, requestId,
      decision: "approved", comment: null }))
      .rejects.toThrow("PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED");
    expect((await database!.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM platform_command_receipts"))[0].count).toBe("0");
    expect((await database!.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM platform_outbox_events"))[0].count).toBe("0");
  });

  it("approves the bound review, receipt and outbox atomically", async () => {
    const result = await decideTransferPackageReview({ metadata, requestId,
      decision: "approved", comment: "reviewed" });
    expect(result).toMatchObject({ requestId, packageId: "package-two",
      decision: "approved", idempotentReplay: false });
    const request = await database!.queryOne<{ request_status: string }>(
      "SELECT request_status FROM approval_platform_requests WHERE id = :requestId", { requestId });
    const pkg = await database!.queryOne<{ package_status: string; approved_by: string }>(
      "SELECT package_status, approved_by FROM transfer_packages WHERE id = 'package-two'");
    const events = await database!.query<{ detail_json: unknown }>(
      "SELECT detail_json FROM transfer_package_events WHERE package_id = 'package-two'");
    expect(request?.request_status).toBe("approved");
    expect(pkg).toMatchObject({ package_status: "ApprovedPendingPublish",
      approved_by: "profile-reviewer" });
    expect(events).toHaveLength(1);
    expect(events[0].detail_json).toMatchObject({ principalId: "principal-reviewer", requestId });
    const receipts = await database!.query<{ command_status: string; principal_id: string }>(
      "SELECT command_status,principal_id FROM platform_command_receipts");
    const outbox = await database!.query<{ principal_id: string; platform_principal_id: string | null;
      delivery_status: string }>("SELECT principal_id,platform_principal_id,delivery_status FROM platform_outbox_events");
    expect(receipts).toEqual([{ command_status: "completed", principal_id: "principal-reviewer" }]);
    expect(outbox).toEqual([{ principal_id: "principal-reviewer",
      platform_principal_id: null, delivery_status: "pending" }]);
    const replay = await decideTransferPackageReview({ metadata, requestId,
      decision: "approved", comment: "reviewed" });
    expect(replay).toMatchObject({ requestId, idempotentReplay: true });
    expect((await database!.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM platform_outbox_events"))[0].count).toBe("1");
  });

  it("does not replay a resolved request as a second decision", async () => {
    await expect(decideTransferPackageReview({ metadata: { ...metadata,
      idempotencyKey: "transfer-decision-second" }, requestId,
      decision: "rejected", comment: null })).rejects.toMatchObject({
      code: "APPROVAL_REQUEST_ALREADY_DECIDED", status: 409
    });
    const rows = await database!.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM approval_platform_decisions WHERE request_id = :requestId",
      { requestId });
    expect(rows[0].count).toBe("1");
  });

  it("submits, shows, decides and reloads one package using PostgreSQL owner commands", async () => {
    const submitRoutePath = "src/app/api/transfer-packages/[id]/submit-review/route.ts";
    const submitRequest = new Request("https://ai-pdm.test/api/transfer-packages/package-three/submit-review", {
      method: "POST", headers: { cookie: `pdm_session=${token}` }
    });
    expect(principalCommandRouteMatches(submitRequest, submitRoutePath, "POST")).toBe(true);
    expect(principalSessionTokenFromRequest(submitRequest)).toBe(token);
    expect(resolveJenfuRoutePolicy(submitRoutePath, "POST", {
      expectedPermissionCode: "transfer.package.review.submit"
    })).toMatchObject({ authorizationMode: "permission", scopeResolver: "workspace" });
    expect(ownerActor).toMatchObject({ principalId: "principal-owner",
      pdmUserId: "profile-owner", organizationId: companyId });
    mocks.verify.mockImplementationOnce(async (input, evaluate, options) =>
      input.database.transaction((client: AsyncDatabaseClient) => evaluate(client, {
        profile: { pdmUserId: "profile-owner", companyId },
        session: { contractVersion: "jenfu.ai-pdm-session.v2", appId: "ai-pdm",
          sessionId: "session-owner", identityIssuer: "issuer-legacy",
          identitySubject: "subject-owner", principalId: "principal-owner",
          employeeId: "employee-owner", authEpoch: 1, profileVersion: 1,
          issuedAt: "2026-09-29T00:00:00.000Z", expiresAt: "2026-09-30T00:00:00.000Z",
          assuranceLevel: "aal2" }
      }), options));
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true, principalId: "principal-owner",
      permissionCode: "transfer.package.review.submit", roleCode: "rd" }]);
    const submitted = await submitTransferPackageReview({
      metadata: { ...metadata, actor: ownerActor, idempotencyKey: "transfer-submit-pg",
        principalAuthorization: { ...metadata.principalAuthorization,
          permissionCode: "transfer.package.review.submit",
          discriminator: undefined, request: submitRequest, routePath: submitRoutePath } },
      packageId: "package-three", expectedRowVersion: 1, reason: "review ready"
    });
    expect(submitted).toMatchObject({ packageId: "package-three", idempotentReplay: false });
    const pending = await database!.queryOne<{ request_status: string; payload_json: {
      reviewer: { principalId: string; profileId: string } } }>(
      "SELECT request_status,payload_json FROM approval_platform_requests WHERE id=:id",
      { id: submitted.requestId });
    expect(pending).toMatchObject({ request_status: "pending",
      payload_json: { reviewer: { principalId: "principal-reviewer", profileId: "profile-reviewer" } } });
    const inbox = await new AsyncApprovalPlatformRepository(database!).listPrincipalWorkReviewInbox({
      companyId, actorId: "profile-reviewer", principalId: "principal-reviewer",
      domainCode: "transfer", status: "active", limit: 10
    });
    expect(inbox.items.map((item) => item.packageId)).toContain("package-three");
    const decided = await decideTransferPackageReview({
      metadata: { ...metadata, idempotencyKey: "transfer-decision-three" },
      requestId: submitted.requestId, decision: "approved", comment: "approved"
    });
    expect(decided).toMatchObject({ packageId: "package-three", decision: "approved" });
    const reloaded = await database!.queryOne<{ package_status: string; request_status: string;
      submitted_principal: string; decided_principal: string }>(`
      SELECT package.package_status,request.request_status,
        submitted.principal_id AS submitted_principal,
        decided.principal_id AS decided_principal
      FROM transfer_packages package
      JOIN approval_platform_requests request ON request.id=package.review_request_id
      JOIN platform_outbox_events submitted ON submitted.aggregate_id=package.id
        AND submitted.event_type='pdm.transfer.package_review_submitted.v1'
      JOIN platform_outbox_events decided ON decided.aggregate_id=request.id
        AND decided.event_type='pdm.transfer.package_review_decided.v1'
      WHERE package.id='package-three'`);
    expect(reloaded).toEqual({ package_status: "ApprovedPendingPublish",
      request_status: "approved", submitted_principal: "principal-owner",
      decided_principal: "principal-reviewer" });
  });
});

// No drawing_revision_packages table is seeded: the normal consumer must use
// canonical production authority, not silently succeed through a legacy alias.
describe.skipIf(!database || phase !== "snapshot")("Canonical official transfer snapshot PostgreSQL contract", () => {
  let ordinal = 0;
  async function drawingFixture() {
    const suffix = String(++ordinal);
    const numberId = `official-${suffix}`, drawingId = `drawing-${suffix}`;
    const revisionId = `revision-${suffix}`, stateId = `production-${suffix}`;
    const params = { companyId, numberId, drawingId, revisionId, stateId };
    await database!.execute(`INSERT INTO drawing_numbers
      (id,company_id,record_status,purpose_code,purpose_description,is_primary_manufacturing)
      VALUES (:numberId,:companyId,'Active','MA','Manufacturing',true)`, params);
    await database!.execute(`INSERT INTO drawings VALUES (:drawingId,:companyId,:numberId)`, params);
    await database!.execute(`INSERT INTO drawing_revisions
      (id,company_id,drawing_id,revision,lifecycle_state,released_at)
      VALUES (:revisionId,:companyId,:drawingId,'1','released',CURRENT_TIMESTAMP)`, params);
    await database!.execute(`INSERT INTO canonical_workbench_states
      (id,company_id,entity_type,canonical_entity_id,data_layer,revision_id)
      VALUES (:stateId,:companyId,'drawing',:drawingId,'drawing_production',:revisionId)`, params);
    const item = { id: `item-${suffix}`, entityType: "drawing_number" as const,
      entityId: numberId, entityCode: `M-${suffix}`, displayLabel: `Drawing ${suffix}`,
      rootCode: null, recordStatus: "Active", addedBy: "profile-owner",
      createdAt: "2026-10-02T00:00:00.000Z" };
    return { params, item };
  }
  it("reads the exact canonical released version with no legacy package table", async () => {
    const { params, item } = await drawingFixture();
    expect(await officialItemSnapshot(database!, companyId, item)).toMatchObject({
      currentControlledVersionId: params.revisionId, currentControlledVersion: "1",
      currentControlledVersionStatus: "released", recordStatus: "Active"
    });
  });
  it("changes the authority hash when canonical version or approved policy changes", async () => {
    const { params, item } = await drawingFixture();
    await database!.execute(`UPDATE transfer_package_items SET entity_type='drawing_number',
      entity_id=:numberId,entity_code='M-SNAPSHOT' WHERE id='item-three'`, params);
    const before = await buildTransferPackageReadiness("package-three", companyId, database!);
    expect(before.ready).toBe(true);
    await database!.execute(`UPDATE canonical_workbench_states
      SET row_version=row_version+1 WHERE id=:stateId`, params);
    const stateChanged = await buildTransferPackageReadiness("package-three", companyId, database!);
    expect(stateChanged.snapshot.authorityHash).not.toBe(before.snapshot.authorityHash);
    const nextId = `${params.revisionId}-next`;
    await database!.execute(`INSERT INTO drawing_revisions
      (id,company_id,drawing_id,revision,lifecycle_state,released_at)
      VALUES (:nextId,:companyId,:drawingId,'2','released',CURRENT_TIMESTAMP)`, { ...params, nextId });
    await database!.execute(`UPDATE canonical_workbench_states
      SET revision_id=:nextId,row_version=row_version+1 WHERE id=:stateId`, { ...params, nextId });
    const changed = await buildTransferPackageReadiness("package-three", companyId, database!);
    expect(changed.ready).toBe(true);
    expect(changed.snapshot.authorityHash).not.toBe(stateChanged.snapshot.authorityHash);
    expect(await officialItemSnapshot(database!, companyId, item)).toMatchObject({
      currentControlledVersionId: nextId, currentControlledVersion: "2"
    });
    await database!.execute(`UPDATE drawing_revisions SET
      policy_snapshot_json='{"approvedBasis":"changed"}'::jsonb WHERE id=:nextId`, { nextId });
    const policyChanged = await buildTransferPackageReadiness("package-three", companyId, database!);
    expect(policyChanged.snapshot.authorityHash).not.toBe(changed.snapshot.authorityHash);
    await database!.execute(`UPDATE drawing_revisions SET row_version=row_version+1
      WHERE id=:nextId`, { nextId });
    const revisionRowChanged = await buildTransferPackageReadiness("package-three", companyId, database!);
    expect(revisionRowChanged.snapshot.authorityHash).not.toBe(policyChanged.snapshot.authorityHash);
  });
  it("rejects missing production authority and RD-only versions", async () => {
    const { params, item } = await drawingFixture();
    await database!.execute(`UPDATE drawing_revisions SET lifecycle_state='rd_controlled'
      WHERE id=:revisionId`, params);
    expect(await officialItemSnapshot(database!, companyId, item)).toBeNull();
    await database!.execute(`UPDATE drawing_revisions SET lifecycle_state='released' WHERE id=:revisionId`, params);
    await database!.execute(`UPDATE canonical_workbench_states SET data_layer='drawing_rd' WHERE id=:stateId`, params);
    expect(await officialItemSnapshot(database!, companyId, item)).toBeNull();
  });
  it("rejects cross-company and cross-Drawing revision pointers", async () => {
    const { params, item } = await drawingFixture();
    expect(await officialItemSnapshot(database!, "company-other", item)).toBeNull();
    await database!.execute(`UPDATE drawing_revisions SET company_id='company-other' WHERE id=:revisionId`, params);
    expect(await officialItemSnapshot(database!, companyId, item)).toBeNull();
    await database!.execute(`UPDATE drawing_revisions SET company_id=:companyId,drawing_id='wrong-drawing'
      WHERE id=:revisionId`, params);
    expect(await officialItemSnapshot(database!, companyId, item)).toBeNull();
  });
  it("rejects ambiguous canonical mappings instead of choosing the first row", async () => {
    const { params, item } = await drawingFixture();
    await database!.execute(`INSERT INTO drawings VALUES ('ambiguous-drawing',:companyId,:numberId)`, params);
    await database!.execute(`INSERT INTO drawing_revisions
      (id,company_id,drawing_id,revision,lifecycle_state,released_at)
      VALUES ('ambiguous-revision',:companyId,'ambiguous-drawing','1','released',CURRENT_TIMESTAMP)`, params);
    await database!.execute(`INSERT INTO canonical_workbench_states
      (id,company_id,entity_type,canonical_entity_id,data_layer,revision_id)
      VALUES ('ambiguous-state',:companyId,'drawing','ambiguous-drawing','drawing_production','ambiguous-revision')`, params);
    expect(await officialItemSnapshot(database!, companyId, item)).toBeNull();
  });
  it("preserves terminal Drawing and Draft Part eligibility denials", async () => {
    const { params } = await drawingFixture();
    await database!.execute(`UPDATE transfer_package_items SET entity_type='drawing_number',
      entity_id=:numberId WHERE id='item-three'`, params);
    await database!.execute(`UPDATE drawing_numbers SET record_status='Obsolete' WHERE id=:numberId`, params);
    const terminal = await buildTransferPackageReadiness("package-three", companyId, database!);
    expect(terminal.ready).toBe(false);
    expect(terminal.blockers.map(x => x.code)).toContain("transfer_official_item_invalid");
    await database!.execute(`UPDATE part_numbers SET record_status='Draft' WHERE id='part-three'`);
    await database!.execute(`UPDATE transfer_package_items SET entity_type='part_number',
      entity_id='part-three' WHERE id='item-three'`);
    const draft = await buildTransferPackageReadiness("package-three", companyId, database!);
    expect(draft.ready).toBe(false);
    expect(draft.blockers.map(x => x.code)).toContain("transfer_official_item_invalid");
  });
});