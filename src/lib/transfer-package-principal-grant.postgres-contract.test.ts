import { afterAll, describe, expect, it, vi } from "vitest";
import { createPlatformActorContext } from "@/lib/platform-command";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncApprovalPlatformRepository } from "@/lib/repositories/approval-platform-async-repository";

// The provider/session handshake has its own contract suite. Keep only that
// boundary synthetic here; the published grant reader and owner command run
// against the same PostgreSQL transaction and are not mocked.
vi.mock("@/lib/jenfu-principal-request-guard", async (original) => ({
  ...await original<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: async (
    input: { database: AsyncDatabaseClient; token: string },
    evaluate: (client: AsyncDatabaseClient, verified: unknown) => Promise<unknown>,
    options: { isolationLevel?: "repeatable_read" | "serializable"; readOnly?: boolean }
  ) => input.database.transaction((client) => {
    const owner = input.token === ownerToken;
    return evaluate(client, {
    profile: { pdmUserId: owner ? "profile-owner" : "profile-reviewer", companyId: "company-jenfu" },
    session: {
      contractVersion: "jenfu.ai-pdm-session.v2", appId: "ai-pdm",
      sessionId: owner ? "session-owner" : "session-reviewer", identityIssuer: "issuer-legacy",
      identitySubject: owner ? "subject-owner" : "subject-legacy",
      principalId: owner ? "principal-owner" : "principal-reviewer",
      employeeId: owner ? "employee-owner" : "employee-reviewer", authEpoch: 1, profileVersion: 1,
      issuedAt: "2026-09-29T00:00:00.000Z", expiresAt: "2026-09-30T00:00:00.000Z",
      assuranceLevel: "aal2"
    }
  });
  }, options)
}));

import { decideTransferPackageReview, submitTransferPackageReview } from "@/lib/transfer-package-phase1d";

const phase = process.env.PDM_DEV121_TRANSFER_PHASE;
const active = ["grant-assigned", "grant-scoped", "grant-revoked", "grant-delegated", "grant-flow"].includes(phase ?? "") &&
  Boolean(process.env.PDM_POSTGRES_URL);
const database = active ? getAsyncDatabaseClient() : null;
const companyId = "company-jenfu";
const token = `${Buffer.from(JSON.stringify({ type: "JENFU-AI-PDM-PRINCIPAL", version: 2 }))
  .toString("base64url")}.payload.signature`;
const ownerToken = `${Buffer.from(JSON.stringify({ type: "JENFU-AI-PDM-PRINCIPAL", version: 2 }))
  .toString("base64url")}.owner.signature`;
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
  principalId: "principal-owner", roles: ["R&D Manager"],
  authorizationActor: {
    identityIssuer: "issuer-legacy", identitySubject: "subject-owner",
    principalId: "principal-owner", employeeId: "employee-owner",
    localPrincipalId: "profile-owner", companyId, sessionSchemaVersion: 2
  }
});

function command(requestId: string, idempotencyKey: string) {
  const request = new Request(`https://ai-pdm.test/api/approvals/requests/${requestId}/decisions`, {
    method: "POST", headers: { cookie: `pdm_session=${token}` }
  });
  return decideTransferPackageReview({
    metadata: {
      actor, idempotencyKey,
      principalRequest: { token, keyRing: {} as never, identityIssuer: "issuer-legacy",
        trustPolicy: {} as never, database: database! },
      principalAuthorization: {
        request, routePath: "src/app/api/approvals/requests/[requestId]/decisions/route.ts",
        method: "POST", permissionCode: "approval.request.decide",
        discriminator: "approval_decision:transfer_package"
      }
    },
    requestId, decision: "approved", comment: "reviewed"
  });
}

afterAll(async () => { await database?.close(); });

describe.runIf(active)("Published Principal grant controls the transfer command in PostgreSQL", () => {
  it.skipIf(phase !== "grant-assigned")("allows the assigned reviewer and atomically records the business decision", async () => {
    const requestId = "APR-TRF-00000000-0000-4000-8000-000000000005";
    const result = await command(requestId, "grant-decision-allowed");
    expect(result).toMatchObject({ packageId: "package-grant-allowed", decision: "approved" });
    const rows = await database!.query<{ request_status: string; package_status: string;
      principal_id: string; delivery_status: string }>(`
      SELECT request.request_status,package.package_status,
             event.principal_id,event.delivery_status
      FROM approval_platform_requests request
      JOIN transfer_packages package ON package.review_request_id=request.id
      JOIN platform_outbox_events event ON event.aggregate_id=request.id
      WHERE request.id=:requestId`, { requestId });
    expect(rows).toEqual([{ request_status: "approved",
      package_status: "ApprovedPendingPublish", principal_id: "principal-reviewer",
      delivery_status: "pending" }]);
  });

  it.skipIf(phase !== "grant-scoped")("rejects the same bound reviewer after the published workspace scope moves", async () => {
    const requestId = "APR-TRF-00000000-0000-4000-8000-000000000006";
    await expect(command(requestId, "grant-decision-scoped"))
      .rejects.toThrow("PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED");
    expect((await database!.queryOne<{ request_status: string }>(`
      SELECT request_status FROM approval_platform_requests WHERE id=:requestId`,
      { requestId }))?.request_status).toBe("pending");
    expect((await database!.query<{ id: string }>(`
      SELECT id FROM platform_outbox_events WHERE aggregate_id=:requestId`,
      { requestId }))).toEqual([]);
  });

  it.skipIf(phase !== "grant-revoked")("rejects a revoked grant without a command receipt or business write", async () => {
    const requestId = "APR-TRF-00000000-0000-4000-8000-000000000007";
    await expect(command(requestId, "grant-decision-revoked"))
      .rejects.toMatchObject({ code: "entitlement_assignment_not_found" });
    expect((await database!.queryOne<{ request_status: string }>(`
      SELECT request_status FROM approval_platform_requests WHERE id=:requestId`,
      { requestId }))?.request_status).toBe("pending");
    expect((await database!.query<{ id: string }>(`
      SELECT id FROM platform_command_receipts WHERE idempotency_key='grant-decision-revoked'`)))
      .toEqual([]);
  });

  it.skipIf(phase !== "grant-delegated")("uses an explicit delegated Principal grant for only its bound review", async () => {
    const requestId = "APR-TRF-00000000-0000-4000-8000-000000000008";
    const result = await command(requestId, "grant-decision-delegated");
    expect(result).toMatchObject({ packageId: "package-grant-delegated", decision: "approved" });
    const receipt = await database!.queryOne<{ principal_id: string; command_status: string }>(`
      SELECT principal_id,command_status FROM platform_command_receipts
      WHERE idempotency_key='grant-decision-delegated'`);
    expect(receipt).toEqual({ principal_id: "principal-reviewer", command_status: "completed" });
    const unrelated = await database!.queryOne<{ request_status: string }>(`
      SELECT request_status FROM approval_platform_requests
      WHERE id='APR-TRF-00000000-0000-4000-8000-000000000007'`);
    expect(unrelated?.request_status).toBe("pending");
  });

  it.skipIf(phase !== "grant-flow")("submits, selects the non-owner reviewer, decides and reloads with real published grants", async () => {
    const packageId = "package-grant-flow";
    const submitRoutePath = "src/app/api/transfer-packages/[id]/submit-review/route.ts";
    const submitRequest = new Request(`https://ai-pdm.test/api/transfer-packages/${packageId}/submit-review`, {
      method: "POST", headers: { cookie: `pdm_session=${ownerToken}` }
    });
    const submitted = await submitTransferPackageReview({
      metadata: {
        actor: ownerActor, idempotencyKey: "grant-flow-submit",
        principalRequest: { token: ownerToken, keyRing: {} as never,
          identityIssuer: "issuer-legacy", trustPolicy: {} as never, database: database! },
        principalAuthorization: { request: submitRequest, routePath: submitRoutePath,
          method: "POST", permissionCode: "transfer.package.review.submit" }
      }, packageId, expectedRowVersion: 1, reason: "ready for review"
    });
    const pending = await database!.queryOne<{ request_status: string; payload_json: {
      reviewer: { principalId: string; profileId: string } } }>(
      "SELECT request_status,payload_json FROM approval_platform_requests WHERE id=:requestId",
      { requestId: submitted.requestId });
    expect(pending).toMatchObject({ request_status: "pending",
      payload_json: { reviewer: { principalId: "principal-reviewer", profileId: "profile-reviewer" } } });
    const inbox = await new AsyncApprovalPlatformRepository(database!).listPrincipalWorkReviewInbox({
      companyId, actorId: "profile-reviewer", principalId: "principal-reviewer",
      domainCode: "transfer", status: "active", limit: 10
    });
    expect(inbox.items.map((item) => item.packageId)).toContain(packageId);
    const decided = await command(submitted.requestId, "grant-flow-decision");
    expect(decided).toMatchObject({ packageId, decision: "approved" });
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
      WHERE package.id=:packageId`, { packageId });
    expect(reloaded).toEqual({ package_status: "ApprovedPendingPublish",
      request_status: "approved", submitted_principal: "principal-owner",
      decided_principal: "principal-reviewer" });
  });
});
