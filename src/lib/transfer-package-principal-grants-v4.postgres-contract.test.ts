import { afterAll, describe, expect, it, vi } from "vitest";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";

const phase = process.env.DEV057_CONTRACT_PHASE;
const enabled = process.env.DEV057_NATIVE_TRANSFER_PROBE === "1" &&
  Boolean(process.env.PDM_POSTGRES_URL) &&
  ["assigned", "revoked", "out-of-scope", "restored", "flow"].includes(phase ?? "");
const database = enabled ? getAsyncDatabaseClient() : null;
const companyId = "company-jenfu";
const reviewer = {
  principalId: process.env.DEV057_NUMBERING_PRINCIPAL_ID ?? "",
  employeeId: process.env.DEV057_NUMBERING_EMPLOYEE_ID ?? "",
  accountType: process.env.DEV057_NUMBERING_ACCOUNT_TYPE ?? "",
  identityIssuer: process.env.DEV057_NUMBERING_ISSUER ?? "",
  identitySubject: process.env.DEV057_NUMBERING_SUBJECT ?? ""
};
const owner = {
  principalId: process.env.DEV057_FLOW_OWNER_PRINCIPAL_ID ?? "",
  employeeId: process.env.DEV057_FLOW_OWNER_EMPLOYEE_ID ?? "",
  accountType: process.env.DEV057_FLOW_OWNER_ACCOUNT_TYPE ?? "",
  identityIssuer: process.env.DEV057_FLOW_OWNER_ISSUER ?? "",
  identitySubject: process.env.DEV057_FLOW_OWNER_SUBJECT ?? ""
};
const reviewerProfileId = "qc-profile-legacy";
const ownerProfileId = "qc-profile-owner";
const tokenHeader = Buffer.from(JSON.stringify({ type: "JENFU-AI-PDM-PRINCIPAL", version: 2 }))
  .toString("base64url");
const reviewerToken = `${tokenHeader}.reviewer.signature`;
const ownerToken = `${tokenHeader}.owner.signature`;
const profileToken = `${tokenHeader}.profile.signature`;

// Only the verified session boundary is synthetic. Permission lookup, v4 grant
// reads, command authorization, business writes, receipts and outbox stay real.
vi.mock("@/lib/jenfu-principal-request-guard", async (original) => ({
  ...await original<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: async (
    input: { database: AsyncDatabaseClient; token: string },
    evaluate: (client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) => Promise<unknown>,
    options: { isolationLevel?: "repeatable_read" | "serializable"; readOnly?: boolean } = {}
  ) => {
    const isOwner = input.token === ownerToken;
    const tuple = isOwner ? owner : reviewer;
    const verified: VerifiedPrincipalRequest = {
      profile: { pdmUserId: isOwner ? ownerProfileId : reviewerProfileId, companyId },
      session: {
        contractVersion: "jenfu.ai-pdm-session.v2", appId: "ai-pdm",
        sessionId: input.token === profileToken ? `dev057-profile-command-session:${reviewer.principalId}`
          : isOwner ? "dev057-transfer-owner-session" : "dev057-transfer-reviewer-session",
        identityIssuer: tuple.identityIssuer, identitySubject: tuple.identitySubject,
        principalId: tuple.principalId, employeeId: tuple.employeeId,
        authEpoch: 1, profileVersion: 1,
        issuedAt: "2026-10-02T00:00:00.000Z", expiresAt: "2026-10-02T01:00:00.000Z",
        assuranceLevel: "aal1"
      }
    };
    return input.database.transaction((client) => evaluate(client, verified), {
      readOnly: options.readOnly !== false,
      isolationLevel: options.isolationLevel ?? "repeatable_read"
    });
  }
}));

import { GET as candidateRoute, POST as provisionRoute } from "@/app/api/admin/accounts/route";
import { GET as inboxRoute } from "@/app/api/approvals/inbox/route";
import { POST as decideRoute } from "@/app/api/approvals/requests/[requestId]/decisions/route";
import { POST as submitRoute } from "@/app/api/transfer-packages/[id]/submit-review/route";
import { GET as packageRoute } from "@/app/api/transfer-packages/[id]/route";

afterAll(async () => { await database?.close(); });

function apiRequest(path: string, token: string, method = "GET", body?: object, key?: string) {
  return new Request(`https://ai-pdm.test${path}`, {
    method,
    headers: {
      cookie: `pdm_session=${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
      ...(key ? { "idempotency-key": key } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

function decisionRequest(requestId: string, key: string) {
  return apiRequest(`/api/approvals/requests/${requestId}/decisions`, reviewerToken,
    "POST", { decision: "approved", comment: "DEV-057 v4 consumer validation" }, key);
}

async function postDecision(requestId: string, key: string) {
  const request = decisionRequest(requestId, key);
  return decideRoute(request, { params: Promise.resolve({ requestId }) });
}

async function assertPublishedTuple() {
  if (!database) throw new Error("DEV057_TRANSFER_CONSUMER_DATABASE_REQUIRED");
  const tuples = await database.query<{
    contract_version: string; principal_id: string; employee_id: string;
    account_type: string; principal_issuer: string; principal_subject: string;
    employee_status: string
  }>(`
    SELECT contract_version,principal_id,employee_id,account_type,
           principal_issuer,principal_subject,employee_status
    FROM orgmaster_contract.v_active_principal_accounts_v1
    WHERE principal_id=:principalId AND employee_id=:employeeId
      AND principal_issuer=:issuer AND principal_subject=:subject`, {
    principalId: reviewer.principalId, employeeId: reviewer.employeeId,
    issuer: reviewer.identityIssuer, subject: reviewer.identitySubject
  });
  expect(tuples).toContainEqual(expect.objectContaining({
    contract_version: "organization.active-principal.v1",
    principal_id: reviewer.principalId, employee_id: reviewer.employeeId,
    account_type: reviewer.accountType, principal_issuer: reviewer.identityIssuer,
    principal_subject: reviewer.identitySubject, employee_status: "active"
  }));
}

async function assertDecisionEvidence(requestId: string, key: string, status: string) {
  if (!database) throw new Error("DEV057_TRANSFER_CONSUMER_DATABASE_REQUIRED");
  const rows = await database.query<{
    request_status: string; package_status: string; receipt_count: number;
    outbox_count: number; receipt_principal: string | null; outbox_principal: string | null
  }>(`
    SELECT request.request_status,package.package_status,
           (SELECT count(*)::integer FROM platform_command_receipts receipt
             WHERE receipt.idempotency_key=:key) AS receipt_count,
           (SELECT count(*)::integer FROM platform_outbox_events event
             WHERE event.aggregate_id=request.id
               AND event.event_type='pdm.transfer.package_review_decided.v1') AS outbox_count,
           (SELECT receipt.principal_id FROM platform_command_receipts receipt
             WHERE receipt.idempotency_key=:key) AS receipt_principal,
           (SELECT event.principal_id FROM platform_outbox_events event
             WHERE event.aggregate_id=request.id
               AND event.event_type='pdm.transfer.package_review_decided.v1') AS outbox_principal
    FROM approval_platform_requests request
    JOIN transfer_packages package
      ON package.company_id=request.company_id AND package.review_request_id=request.id
    WHERE request.id=:requestId AND request.company_id=:companyId`,
  { requestId, companyId, key });
  if (status === "approved") {
    expect(rows).toEqual([{
      request_status: "approved", package_status: "ApprovedPendingPublish",
      receipt_count: 1, outbox_count: 1,
      receipt_principal: reviewer.principalId, outbox_principal: reviewer.principalId
    }]);
  } else {
    expect(rows).toEqual([expect.objectContaining({
      request_status: "pending", package_status: "InReview", receipt_count: 0, outbox_count: 0
    })]);
  }
}

async function visibleInboxIds(token: string, query: string) {
  const response = await inboxRoute(apiRequest(`/api/approvals/inbox?domain=transfer&action=transfer.package_review&query=${encodeURIComponent(query)}`, token));
  expect(response.status, await response.clone().text()).toBe(200);
  const payload = await response.json() as { rows: Array<{ id: string }> };
  return payload.rows.map((row) => row.id);
}

describe.runIf(enabled)("OrgMaster v4 grants authorize the normal AI-PDM transfer approval routes", () => {
  if (phase === "assigned") {
    it("approves the bound request, replays once, reloads and keeps another company's request invisible", async () => {
      if (!database) throw new Error("DEV057_TRANSFER_CONSUMER_DATABASE_REQUIRED");
      await assertPublishedTuple();
      const requestId = "APR-TRF-00000000-0000-4000-8000-000000000009";
      const key = "dev057-v4-transfer-assigned";
      expect(await visibleInboxIds(reviewerToken, requestId)).toContain(requestId);
      const first = await postDecision(requestId, key);
      expect(first.status, await first.clone().text()).toBe(200);
      const replay = await postDecision(requestId, key);
      expect(replay.status, await replay.clone().text()).toBe(200);
      expect(await visibleInboxIds(reviewerToken, requestId)).not.toContain(requestId);
      await assertDecisionEvidence(requestId, key, "approved");

      const otherRequestId = "APR-TRF-00000000-0000-4000-8000-000000000013";
      const otherPackageId = "package-org-other-company";
      const otherKey = "dev057-v4-transfer-wrong-company";
      expect(await visibleInboxIds(reviewerToken, otherRequestId)).not.toContain(otherRequestId);
      const snapshotWrongCompanyState = async () => database.queryOne<{
        package_row: Record<string, unknown>;
        request_row: Record<string, unknown>;
        decision_count: number;
        approval_event_count: number;
        impact_snapshot_count: number;
        transfer_event_count: number;
        reservation_count: number;
        audit_log_count: number;
        receipt_count: number;
        outbox_count: number;
      }>(`
        SELECT
          (SELECT to_jsonb(pkg) FROM transfer_packages pkg
            WHERE pkg.id=:packageId AND pkg.company_id='company-other') AS package_row,
          (SELECT to_jsonb(request) FROM approval_platform_requests request
            WHERE request.id=:requestId AND request.company_id='company-other') AS request_row,
          (SELECT count(*)::integer FROM approval_platform_decisions
            WHERE request_id=:requestId) AS decision_count,
          (SELECT count(*)::integer FROM approval_platform_events
            WHERE request_id=:requestId OR package_id=:packageId) AS approval_event_count,
          (SELECT count(*)::integer FROM approval_platform_impact_snapshots
            WHERE request_id=:requestId OR package_id=:packageId) AS impact_snapshot_count,
          (SELECT count(*)::integer FROM transfer_package_events
            WHERE package_id=:packageId) AS transfer_event_count,
          (SELECT count(*)::integer FROM number_candidate_reservations
            WHERE approval_request_id=:requestId) AS reservation_count,
          (SELECT count(*)::integer FROM audit_logs) AS audit_log_count,
          (SELECT count(*)::integer FROM platform_command_receipts
            WHERE idempotency_key=:key) AS receipt_count,
          (SELECT count(*)::integer FROM platform_outbox_events
            WHERE idempotency_key=:key OR aggregate_id IN (:requestId,:packageId)) AS outbox_count`,
      { requestId: otherRequestId, packageId: otherPackageId, key: otherKey });
      const beforeWrongCompany = await snapshotWrongCompanyState();
      expect(beforeWrongCompany).toMatchObject({
        package_row: {
          id: otherPackageId, company_id: "company-other", package_status: "InReview",
          row_version: 1, approved_by: null, approved_at: null, review_request_id: otherRequestId
        },
        request_row: { id: otherRequestId, company_id: "company-other", request_status: "pending" },
        decision_count: 0, approval_event_count: 0, impact_snapshot_count: 0,
        transfer_event_count: 0, reservation_count: 0, receipt_count: 0, outbox_count: 0
      });
      const other = await postDecision(otherRequestId, otherKey);
      expect(other.status).toBe(404);
      expect(await snapshotWrongCompanyState()).toEqual(beforeWrongCompany);
    });
    it("uses the exact typed human account tuple without changing its account type", async () => {
      expect(reviewer.principalId).toBeTruthy();
      expect(reviewer.employeeId).toBeTruthy();
      expect(["human_personal", "human_privileged"]).toContain(reviewer.accountType);
      await assertPublishedTuple();
    });
  } else if (phase === "revoked" || phase === "out-of-scope") {
    it("denies a revoked or out-of-company v4 reviewer before receipt, outbox or business writes", async () => {
      if (!database) throw new Error("DEV057_TRANSFER_CONSUMER_DATABASE_REQUIRED");
      await assertPublishedTuple();
      const requestId = phase === "revoked"
        ? "APR-TRF-00000000-0000-4000-8000-000000000010"
        : "APR-TRF-00000000-0000-4000-8000-000000000011";
      const key = `dev057-v4-transfer-${phase}`;
      const response = await postDecision(requestId, key);
      expect(response.status).toBe(403);
      await assertDecisionEvidence(requestId, key, "pending");
    });
  } else if (phase === "restored") {
    it("allows the restored exact scope and replays without duplicating effects", async () => {
      if (!database) throw new Error("DEV057_TRANSFER_CONSUMER_DATABASE_REQUIRED");
      await assertPublishedTuple();
      const requestId = "APR-TRF-00000000-0000-4000-8000-000000000012";
      const key = "dev057-v4-transfer-restored";
      const first = await postDecision(requestId, key);
      expect(first.status, await first.clone().text()).toBe(200);
      const replay = await postDecision(requestId, key);
      expect(replay.status, await replay.clone().text()).toBe(200);
      await assertDecisionEvidence(requestId, key, "approved");
    });
  } else if (phase === "flow") {
    it("submits through the owner route, reviews through inbox and decision routes, then reloads the approved package", async () => {
      if (!database) throw new Error("DEV057_TRANSFER_CONSUMER_DATABASE_REQUIRED");
      await assertPublishedTuple();
      const packageId = "package-org-flow";
      const submitKey = "dev057-v4-transfer-flow-submit";
      const submit = await submitRoute(apiRequest(`/api/transfer-packages/${packageId}/submit-review`,
        ownerToken, "POST", { expectedRowVersion: 1, reason: "DEV-057 normal transfer approval flow" }, submitKey),
      { params: Promise.resolve({ id: packageId }) });
      expect(submit.status, await submit.clone().text()).toBe(200);
      const submitted = await submit.json() as { requestId: string };
      expect(submitted.requestId).toMatch(/^APR-TRF-/u);
      expect(await visibleInboxIds(reviewerToken, submitted.requestId)).toContain(submitted.requestId);
      const submittedRow = await database.queryOne<{ request_status: string; payload_json: {
        transferPackageId: string; reviewer: { principalId: string; profileId: string }
      } }>(`SELECT request_status,payload_json FROM approval_platform_requests WHERE id=:requestId`,
      { requestId: submitted.requestId });
      expect(submittedRow).toMatchObject({ request_status: "pending", payload_json: {
        transferPackageId: packageId,
        reviewer: { principalId: reviewer.principalId, profileId: reviewerProfileId }
      } });

      const decisionKey = "dev057-v4-transfer-flow-decision";
      const decision = await postDecision(submitted.requestId, decisionKey);
      expect(decision.status, await decision.clone().text()).toBe(200);
      const replay = await postDecision(submitted.requestId, decisionKey);
      expect(replay.status, await replay.clone().text()).toBe(200);
      expect(await visibleInboxIds(reviewerToken, submitted.requestId)).not.toContain(submitted.requestId);
      await assertDecisionEvidence(submitted.requestId, decisionKey, "approved");

      const reloaded = await packageRoute(apiRequest(`/api/transfer-packages/${packageId}`, reviewerToken),
        { params: Promise.resolve({ id: packageId }) });
      expect(reloaded.status, await reloaded.clone().text()).toBe(200);
      expect(await reloaded.json()).toMatchObject({
        workbench: { id: packageId, status: "ApprovedPendingPublish" }
      });
      const receipts = await database.query<{ idempotency_key: string; principal_id: string; command_status: string }>(`
        SELECT idempotency_key,principal_id,command_status FROM platform_command_receipts
        WHERE idempotency_key IN (:submitKey,:decisionKey) ORDER BY idempotency_key`,
      { submitKey, decisionKey });
      expect(receipts).toEqual([
        { idempotency_key: decisionKey, principal_id: reviewer.principalId, command_status: "completed" },
        { idempotency_key: submitKey, principal_id: owner.principalId, command_status: "completed" }
      ]);
      const outbox = await database.query<{ principal_id: string; event_type: string }>(`
        SELECT principal_id,event_type FROM platform_outbox_events
        WHERE idempotency_key IN (:submitKey,:decisionKey) ORDER BY event_type`,
      { submitKey, decisionKey });
      expect(outbox).toHaveLength(2);
      expect(outbox).toEqual(expect.arrayContaining([
        { principal_id: owner.principalId, event_type: "pdm.transfer.package_review_submitted.v1" },
        { principal_id: reviewer.principalId, event_type: "pdm.transfer.package_review_decided.v1" }
      ]));
    });
  }
});


// Route composition with the real producer, capability reader, SERIALIZABLE
// service and owner SQL. Only verified provider/session input remains synthetic.
describe.skipIf(!enabled)("published Principal profile route composition", () => {
  it("uses exact candidate payload, rejects unauthorized phases, commits once and replays", async () => {
    if (!database) throw new Error("DEV057_TRANSFER_CONSUMER_DATABASE_REQUIRED");
    const operationId = "verified-profile-probe";
    const post = (body: object) => provisionRoute(new Request("https://ai-pdm.test/api/admin/accounts", {
      method: "POST", headers: { origin: "https://ai-pdm.test", "content-type": "application/json",
        cookie: `pdm_session=${profileToken}` }, body: JSON.stringify(body)
    }));
    const invalid = { contractVersion: "ai-pdm.principal-provision.v1", operationId,
      principalRef: { principalId: "unverified-target", identityIssuer: "missing-issuer",
        identitySubject: "missing-subject", employeeId: "missing-employee", accountType: "human_personal",
        mappingVersion: 1, publishedAt: "2026-01-01T00:00:00.000Z" },
      displayName: "Unverified target", contactEmail: null, accountEnabled: false };
    const denied = await post(invalid);
    expect(denied.status, await denied.clone().text()).toBe(phase === "flow" ? 409 : 403);
    if (phase !== "flow") return;
    const target = await database.queryOne<{ principal_id: string; principal_issuer: string; principal_subject: string }>(`
      SELECT typed.principal_id,typed.principal_issuer,typed.principal_subject FROM orgmaster_contract.v_active_principal_accounts_v1 typed
      WHERE typed.employee_status='active' AND typed.account_type IN ('human_personal','human_privileged')
        AND NOT EXISTS (SELECT 1 FROM ai_pdm_core.principal_accounts account
          WHERE account.principal_id=typed.principal_id)
      ORDER BY typed.principal_id,typed.principal_issuer,typed.principal_subject LIMIT 1`);
    expect(target?.principal_id).toBeTruthy();
    const candidateResponse = await candidateRoute(apiRequest(
      `/api/admin/accounts?view=principal-candidate&principalId=${encodeURIComponent(target!.principal_id)}`, profileToken));
    expect(candidateResponse.status, await candidateResponse.clone().text()).toBe(200);
    const candidates = (await candidateResponse.json()).candidates as Array<Record<string, unknown>>;
    // One Principal may have multiple verified provider aliases. Select the
    // exact published pair read above, as the UI's candidate selector does.
    const selected = candidates.filter(candidate => candidate.principalId === target!.principal_id &&
      candidate.identityIssuer === target!.principal_issuer && candidate.identitySubject === target!.principal_subject);
    expect(selected).toHaveLength(1);
    const body = { contractVersion: "ai-pdm.principal-provision.v1", operationId,
      principalRef: selected[0], displayName: "Verified native profile", contactEmail: null, accountEnabled: false };
    const first = await post(body);
    expect(first.status, await first.clone().text()).toBe(201);
    const receipt = await first.json();
    const replay = await post(body);
    expect(replay.status, await replay.clone().text()).toBe(200);
    expect(await replay.json()).toMatchObject({ operationId, principalId: target!.principal_id,
      pdmUserId: receipt.pdmUserId, replayed: true });
    expect(receipt).toMatchObject({ operationId, principalId: target!.principal_id, replayed: false,
      current: { accountStatus: "suspended" } });
    const persisted = await database.queryOne(`SELECT account.principal_id,account.employee_id,
      account.pdm_user_id,account.company_id AS account_company_id,account.account_status,
      profile.company_id FROM ai_pdm_core.principal_accounts account
      JOIN ai_pdm_core.users profile ON profile.id=account.pdm_user_id WHERE account.principal_id=:principalId`,
    { principalId: target!.principal_id });
    expect(persisted).toEqual({ principal_id: target!.principal_id, employee_id: selected[0].employeeId,
      pdm_user_id: receipt.pdmUserId, account_company_id: companyId, account_status: "suspended", company_id: companyId });

  });
});
