import { afterAll, describe, expect, it, vi } from "vitest";
import { createPlatformActorContext } from "@/lib/platform-command";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncApprovalPlatformRepository } from "@/lib/repositories/approval-platform-async-repository";

const flowOwnerPrincipalId = process.env.DEV057_FLOW_OWNER_PRINCIPAL_ID || "unused-flow-owner";

// The session/provider contract has its own suite. This test keeps only that
// input synthetic; OrgMaster's published v3 view and the AI-PDM transaction
// below are real and share the same task-owned PostgreSQL instance.
vi.mock("@/lib/jenfu-principal-request-guard", async (original) => ({
  ...await original<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: async (
    input: { database: AsyncDatabaseClient; token: string },
    evaluate: (client: AsyncDatabaseClient, verified: unknown) => Promise<unknown>,
    options: { isolationLevel?: "repeatable_read" | "serializable"; readOnly?: boolean }
  ) => input.database.transaction((client) => evaluate(client, {
    profile: { pdmUserId: input.token === ownerToken ? "qc-profile-owner" : "qc-profile-legacy",
      companyId: "company-jenfu" },
    session: {
      contractVersion: "jenfu.ai-pdm-session.v2", appId: "ai-pdm",
      sessionId: input.token === ownerToken ? "dev057-owner-session" : "dev057-transfer-session",
      identityIssuer: input.token === ownerToken ? "issuer-race-binder-first" : "issuer-legacy",
      identitySubject: input.token === ownerToken ? "subject-race-binder-first" : "subject-legacy",
      principalId: input.token === ownerToken ? flowOwnerPrincipalId : "principal-legacy",
      employeeId: input.token === ownerToken ? "employee-three" : "employee-legacy",
      authEpoch: 1, profileVersion: 1,
      issuedAt: "2026-09-29T00:00:00.000Z", expiresAt: "2026-09-30T00:00:00.000Z",
      assuranceLevel: "aal1"
    }
  }), options)
}));

let decisionRouteMetadata: Parameters<typeof decideTransferPackageReview>[0]["metadata"] | null = null;
vi.mock("@/lib/platform-command-context", async (original) => ({
  ...await original<typeof import("@/lib/platform-command-context")>(),
  requireNumberingPlatformCommandAsync: async () => ({
    response: null, actor, metadata: decisionRouteMetadata
  })
}));

import { decideTransferPackageReview } from "@/lib/transfer-package-phase1d";
import { POST as decideTransferReviewRoute } from "@/app/api/approvals/requests/[requestId]/decisions/route";
import { POST as submitTransferReviewRoute } from "@/app/api/transfer-packages/[id]/submit-review/route";

const phase = process.env.DEV057_CONTRACT_PHASE;
const database = process.env.DEV057_CONTRACT_POSTGRES_URL && phase
  ? getAsyncDatabaseClient() : null;
const token = `${Buffer.from(JSON.stringify({ type: "JENFU-AI-PDM-PRINCIPAL", version: 2 }))
  .toString("base64url")}.payload.signature`;
const ownerToken = `${Buffer.from(JSON.stringify({ type: "JENFU-AI-PDM-PRINCIPAL", version: 2 }))
  .toString("base64url")}.owner.signature`;
const actor = createPlatformActorContext({
  pdmUserId: "qc-profile-legacy", organizationId: "company-jenfu",
  principalId: "principal-legacy", roles: ["R&D Manager"],
  authorizationActor: {
    identityIssuer: "issuer-legacy", identitySubject: "subject-legacy",
    principalId: "principal-legacy", employeeId: "employee-legacy",
    localPrincipalId: "qc-profile-legacy", companyId: "company-jenfu",
    sessionSchemaVersion: 2
  }
});
const ownerActor = createPlatformActorContext({
  pdmUserId: "qc-profile-owner", organizationId: "company-jenfu",
  principalId: flowOwnerPrincipalId, roles: ["R&D Manager"],
  authorizationActor: {
    identityIssuer: "issuer-race-binder-first",
    identitySubject: "subject-race-binder-first",
    principalId: flowOwnerPrincipalId, employeeId: "employee-three",
    localPrincipalId: "qc-profile-owner", companyId: "company-jenfu",
    sessionSchemaVersion: 2
  }
});
const requests: Record<string, { id: string; packageId: string }> = {
  assigned: { id: "APR-TRF-00000000-0000-4000-8000-000000000009", packageId: "package-org-assigned" },
  revoked: { id: "APR-TRF-00000000-0000-4000-8000-000000000010", packageId: "package-org-revoked" },
  "out-of-scope": { id: "APR-TRF-00000000-0000-4000-8000-000000000011", packageId: "package-org-scoped" },
  restored: { id: "APR-TRF-00000000-0000-4000-8000-000000000012", packageId: "package-org-restored" }
};

afterAll(async () => { await database?.close(); });

describe.runIf(Boolean(database && phase && (requests[phase] || phase === "flow")))(
  "OrgMaster published v3 grant controls the AI-PDM transfer decision", () => {
    it.skipIf(phase === "flow")("commits only while the owner-published grant and scope authorize this reviewer", async () => {
      if (!database || !phase) throw new Error("DEV057_CONTRACT_POSTGRES_URL_REQUIRED");
      const current = requests[phase];
      const request = new Request(`https://ai-pdm.test/api/approvals/requests/${current.id}/decisions`, {
        method: "POST", headers: { cookie: `pdm_session=${token}` }
      });
      const run = () => decideTransferPackageReview({
        metadata: {
          actor, idempotencyKey: `dev057-transfer-${phase}`,
          principalRequest: { token, keyRing: {} as never, identityIssuer: "issuer-legacy",
            trustPolicy: {} as never, database },
          principalAuthorization: {
            request, routePath: "src/app/api/approvals/requests/[requestId]/decisions/route.ts",
            method: "POST", permissionCode: "approval.request.decide",
            discriminator: "approval_decision:transfer_package"
          }
        }, requestId: current.id, decision: "approved", comment: "reviewed"
      });
      if (phase === "assigned" || phase === "restored") {
        const inboxBefore = await new AsyncApprovalPlatformRepository(database)
          .listPrincipalWorkReviewInbox({
            companyId: "company-jenfu", actorId: "qc-profile-legacy",
            principalId: "principal-legacy", status: "active", domainCode: "transfer",
            actionCode: "transfer.package_review", query: current.id, limit: 100
          });
        expect(inboxBefore.items).toEqual([expect.objectContaining({
          id: current.id, packageId: current.packageId, source: "platform", status: "pending"
        })]);
        await expect(run()).resolves.toMatchObject({ packageId: current.packageId, decision: "approved" });
        const inboxAfter = await new AsyncApprovalPlatformRepository(database)
          .listPrincipalWorkReviewInbox({
            companyId: "company-jenfu", actorId: "qc-profile-legacy",
            principalId: "principal-legacy", status: "active", domainCode: "transfer",
            actionCode: "transfer.package_review", query: current.id, limit: 100
          });
        expect(inboxAfter.items).toEqual([]);
        const rows = await database.query<{ request_status: string; package_status: string;
          receipt_principal: string; outbox_principal: string; delivery_status: string }>(`
          SELECT request.request_status,package.package_status,
                 receipt.principal_id AS receipt_principal,
                 event.principal_id AS outbox_principal,event.delivery_status
          FROM approval_platform_requests request
          JOIN transfer_packages package ON package.review_request_id=request.id
          JOIN platform_command_receipts receipt ON receipt.idempotency_key=:key
          JOIN platform_outbox_events event ON event.aggregate_id=request.id
          WHERE request.id=:requestId`,
        { key: `dev057-transfer-${phase}`, requestId: current.id });
        expect(rows).toEqual([{ request_status: "approved",
          package_status: "ApprovedPendingPublish", receipt_principal: "principal-legacy",
          outbox_principal: "principal-legacy", delivery_status: "pending" }]);
      } else {
        const routeRequest = new Request(
          `https://ai-pdm.test/api/approvals/requests/${current.id}/decisions`, {
            method: "POST", headers: { cookie: `pdm_session=${token}`,
              "content-type": "application/json", "idempotency-key": `dev057-transfer-${phase}` },
            body: JSON.stringify({ decision: "approved", comment: "reviewed" })
          });
        decisionRouteMetadata = {
          actor, idempotencyKey: `dev057-transfer-${phase}`,
          principalRequest: { token, keyRing: {} as never, identityIssuer: "issuer-legacy",
            trustPolicy: {} as never, database },
          principalAuthorization: {
            request: routeRequest,
            routePath: "src/app/api/approvals/requests/[requestId]/decisions/route.ts",
            method: "POST", permissionCode: "approval.request.decide",
            discriminator: "approval_decision:transfer_package"
          }
        };
        const response = await decideTransferReviewRoute(routeRequest,
          { params: Promise.resolve({ requestId: current.id }) });
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: phase === "revoked"
          ? "entitlement_assignment_not_found" : "permission_not_granted" });
        expect((await database.queryOne<{ request_status: string }>(`
          SELECT request_status FROM approval_platform_requests WHERE id=:requestId`,
        { requestId: current.id }))?.request_status).toBe("pending");
        expect(await database.query<{ id: string }>(`
          SELECT id FROM platform_command_receipts WHERE idempotency_key=:key`,
        { key: `dev057-transfer-${phase}` })).toEqual([]);
        expect(await database.query<{ id: string }>(`
          SELECT id FROM platform_outbox_events WHERE aggregate_id=:requestId`,
        { requestId: current.id })).toEqual([]);
      }
    });

    it.skipIf(phase !== "flow")("submits, binds the published non-owner reviewer, decides and reloads", async () => {
      if (!database) throw new Error("DEV057_CONTRACT_POSTGRES_URL_REQUIRED");
      const packageId = "package-org-flow";
      const submitRequest = new Request(`https://ai-pdm.test/api/transfer-packages/${packageId}/submit-review`, {
        method: "POST", headers: { cookie: `pdm_session=${ownerToken}`,
          "content-type": "application/json", "idempotency-key": "dev057-flow-submit" },
        body: JSON.stringify({ expectedRowVersion: 1, reason: "ready for review" })
      });
      decisionRouteMetadata = {
        actor: ownerActor, idempotencyKey: "dev057-flow-submit",
        principalRequest: { token: ownerToken, keyRing: {} as never,
          identityIssuer: "issuer-race-binder-first",
          trustPolicy: {} as never, database },
        principalAuthorization: {
          request: submitRequest,
          routePath: "src/app/api/transfer-packages/[id]/submit-review/route.ts",
          method: "POST", permissionCode: "transfer.package.review.submit"
        }
      };
      const submitResponse = await submitTransferReviewRoute(submitRequest,
        { params: Promise.resolve({ id: packageId }) });
      expect(submitResponse.status).toBe(200);
      const submitted = await submitResponse.json() as { requestId: string };
      const pending = await database.queryOne<{ request_status: string; payload_json: {
        reviewer: { principalId: string; profileId: string } } }>(
        "SELECT request_status,payload_json FROM approval_platform_requests WHERE id=:requestId",
        { requestId: submitted.requestId });
      expect(pending).toMatchObject({ request_status: "pending", payload_json: {
        reviewer: { principalId: "principal-legacy", profileId: "qc-profile-legacy" }
      } });
      const inbox = await new AsyncApprovalPlatformRepository(database)
        .listPrincipalWorkReviewInbox({
          companyId: "company-jenfu", actorId: "qc-profile-legacy",
          principalId: "principal-legacy", status: "active", domainCode: "transfer",
          actionCode: "transfer.package_review", query: submitted.requestId, limit: 100
        });
      expect(inbox.items).toEqual([expect.objectContaining({
        id: submitted.requestId, packageId, status: "pending"
      })]);
      const decideRequest = new Request(
        `https://ai-pdm.test/api/approvals/requests/${submitted.requestId}/decisions`, {
          method: "POST", headers: { cookie: `pdm_session=${token}`,
            "content-type": "application/json", "idempotency-key": "dev057-flow-decision" },
          body: JSON.stringify({ decision: "approved", comment: "reviewed" })
        });
      decisionRouteMetadata = {
        actor, idempotencyKey: "dev057-flow-decision",
        principalRequest: { token, keyRing: {} as never, identityIssuer: "issuer-legacy",
          trustPolicy: {} as never, database },
        principalAuthorization: {
          request: decideRequest,
          routePath: "src/app/api/approvals/requests/[requestId]/decisions/route.ts",
          method: "POST", permissionCode: "approval.request.decide",
          discriminator: "approval_decision:transfer_package"
        }
      };
      const response = await decideTransferReviewRoute(decideRequest,
        { params: Promise.resolve({ requestId: submitted.requestId }) });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ request: { id: submitted.requestId } });
      const reloaded = await database.queryOne<{
        package_status: string; request_status: string;
        submit_principal: string; decide_principal: string
      }>(`
        SELECT package.package_status,request.request_status,
          submit_event.principal_id AS submit_principal,
          decide_event.principal_id AS decide_principal
        FROM transfer_packages package
        JOIN approval_platform_requests request ON request.id=package.review_request_id
        JOIN platform_outbox_events submit_event ON submit_event.aggregate_id=package.id
          AND submit_event.event_type='pdm.transfer.package_review_submitted.v1'
        JOIN platform_outbox_events decide_event ON decide_event.aggregate_id=request.id
          AND decide_event.event_type='pdm.transfer.package_review_decided.v1'
        WHERE package.id=:packageId`, { packageId });
      expect(reloaded).toEqual({ package_status: "ApprovedPendingPublish",
        request_status: "approved", submit_principal: flowOwnerPrincipalId,
        decide_principal: "principal-legacy" });
      const receipts = await database.query<{
        idempotency_key: string; principal_id: string; command_status: string
      }>(`
        SELECT idempotency_key,principal_id,command_status
        FROM platform_command_receipts
        WHERE idempotency_key IN (:submitKey,:decisionKey)
        ORDER BY idempotency_key`, {
        submitKey: "dev057-flow-submit", decisionKey: "dev057-flow-decision"
      });
      expect(receipts).toEqual([
        { idempotency_key: "dev057-flow-decision", principal_id: "principal-legacy",
          command_status: "completed" },
        { idempotency_key: "dev057-flow-submit", principal_id: flowOwnerPrincipalId,
          command_status: "completed" }
      ]);
    });
  }
);
