import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
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


const nativePreviewFixture = process.env.PDM_DEV121_NATIVE_PREVIEW_FIXTURE;
describe.skipIf(!enabled || phase !== "flow" || !nativePreviewFixture)("full-owner attachment native worker composition", () => {
  it("uploads through the published Principal command, enqueues and persists actual native worker output", async () => {
    if (!database || !nativePreviewFixture) throw new Error("DEV121_NATIVE_FIXTURE_REQUIRED");
    expect(process.platform).toBe("win32");
    expect(path.isAbsolute(nativePreviewFixture)).toBe(true);
    const source = await readFile(nativePreviewFixture);
    const sourceHash = createHash("sha256").update(source).digest("hex");
    const { POST: uploadRoute } = await import("@/app/api/parts/[partNumber]/attachments/route");
    const form = new FormData();
    form.set("file", new File([new Uint8Array(source)], "fixture.sldprt", { type: "application/octet-stream" }));
    form.set("document_category", "other");
    const key = "dev057-full-owner-native-upload";
    const upload = await uploadRoute(new Request("https://ai-pdm.test/api/parts/QF057-P02/attachments", {
      method: "POST", headers: { cookie: `pdm_session=${reviewerToken}`,
        origin: "https://ai-pdm.test", "idempotency-key": key }, body: form
    }), { params: Promise.resolve({ partNumber: "QF057-P02" }) });
    expect(upload.status, await upload.clone().text()).toBe(201);
    const uploaded = await upload.json();
    expect(uploaded.attachment.id).toBeTruthy();
    const queued = await database.query<{ id: string; metadata_json: string; source_content_hash: string }>(`
      SELECT id,metadata_json,source_content_hash FROM ai_pdm_core.preview_jobs
      WHERE source_file_asset_id=:assetId`, { assetId: uploaded.attachment.id });
    expect(queued).toHaveLength(1);
    const jobId = queued[0].id;
    expect(queued[0].source_content_hash).toBe(sourceHash);
    const metadata = typeof queued[0].metadata_json === "string"
      ? JSON.parse(queued[0].metadata_json) : queued[0].metadata_json;
    expect(metadata.initiator.principalId).toBe(reviewer.principalId);
    const [{ POST: claim }, { GET: content }, { POST: complete }, { POST: heartbeat }, { POST: capability }] = await Promise.all([
      import("@/app/api/preview-jobs/claim/route"), import("@/app/api/preview-jobs/[jobId]/content/route"),
      import("@/app/api/preview-jobs/[jobId]/complete/route"), import("@/app/api/preview-jobs/[jobId]/heartbeat/route"),
      import("@/app/api/preview-workers/heartbeat/route")
    ]);
    const server = createServer(async (incoming, outgoing) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
        const body = Buffer.concat(chunks);
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("BRIDGE_ADDRESS_INVALID");
        const url = `http://127.0.0.1:${address.port}${incoming.url}`;
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (typeof value === "string") headers.set(name, value);
          else if (value) headers.set(name, value.join(","));
        }
        const request = new Request(url, { method: incoming.method, headers,
          ...(body.length ? { body: new Uint8Array(body) } : {}) });
        const pathname = new URL(url).pathname;
        const context = { params: Promise.resolve({ jobId }) };
        let response: Response;
        if (pathname === "/api/preview-jobs/claim" && incoming.method === "POST") response = await claim(request);
        else if (pathname === "/api/preview-workers/heartbeat" && incoming.method === "POST") response = await capability(request);
        else if (pathname === `/api/preview-jobs/${jobId}/content` && incoming.method === "GET") response = await content(request, context);
        else if (pathname === `/api/preview-jobs/${jobId}/complete` && incoming.method === "POST") response = await complete(request, context);
        else if (pathname === `/api/preview-jobs/${jobId}/heartbeat` && incoming.method === "POST") response = await heartbeat(request, context);
        else response = new Response(null, { status: 404 });
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch { outgoing.writeHead(500); outgoing.end("Task HTTP bridge failure"); }
    });
    let worker: ReturnType<typeof spawn> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let workerFinished: Promise<number | null> | undefined;
    const stopOwnWorker = () => {
      if (!worker || worker.exitCode !== null || !worker.pid) return;
      // The PID belongs to the exact child spawned by this case, never a name/port kill.
      spawn("taskkill.exe", ["/PID", String(worker.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    };
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject); server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("BRIDGE_ADDRESS_INVALID");
      console.log(JSON.stringify({ runtimeDeclaration: { project: "AIPDM/DEV121", purpose: "full-owner native preview HTTP",
        port: address.port, owningProcessTree: `vitest:${process.pid} -> exact worker child`,
        cleanupCondition: "worker exits, HTTP closes, outer runner closes PG and removes isolated repo", productionWrites: false } }));
      if (!process.env.PDM_DATA_DIR) throw new Error("ISOLATED_DATA_DIR_REQUIRED");
      await mkdir(process.env.PDM_DATA_DIR, { recursive: true });
      worker = spawn(process.execPath, ["scripts/run-windows-shell-preview-worker.mjs", "--base-url",
        `http://127.0.0.1:${address.port}`, "--worker-id", "dev057-native-worker", "--models-only", "--canary-source", nativePreviewFixture],
      { cwd: process.cwd(), env: { ...process.env, TEMP: process.env.PDM_DATA_DIR, TMP: process.env.PDM_DATA_DIR }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      worker.stdout?.resume();
      worker.stderr?.on("data", chunk => { stderr += String(chunk); });
      workerFinished = new Promise<number | null>((resolve, reject) => {
        worker!.once("error", reject); worker!.once("close", resolve);
      });
      timer = setTimeout(() => { timedOut = true; stopOwnWorker(); }, 120_000);
      const exitCode = await workerFinished;
      expect(timedOut).toBe(false);
      expect(exitCode, stderr).toBe(0);
      const job = await database.queryOne<{ status: string; locked_by: string }>(`
        SELECT status,locked_by FROM ai_pdm_core.preview_jobs WHERE id=:jobId`, { jobId });
      expect(job).toMatchObject({ status: "succeeded", locked_by: "dev057-native-worker" });
      const derivatives = await database.query<{ company_id: string; content_hash: string; source_content_hash: string;
        generator_version: string; original_path: string; created_by_worker: string }>(`
        SELECT company_id,content_hash,source_content_hash,generator_version,original_path,created_by_worker
        FROM ai_pdm_core.file_derivatives WHERE preview_job_id=:jobId`, { jobId });
      expect(derivatives).toHaveLength(1);
      expect(derivatives[0]).toMatchObject({ company_id: companyId, source_content_hash: sourceHash,
        generator_version: "windows-shell-ishellitemimagefactory-v2", created_by_worker: "dev057-native-worker" });
      const png = await readFile(derivatives[0].original_path);
      expect(createHash("sha256").update(png).digest("hex")).toBe(derivatives[0].content_hash);
      const { default: sharp } = await import("sharp");
      const image = await sharp(png).metadata();
      expect(image.format).toBe("png"); expect(image.width).toBeGreaterThan(1); expect(image.height).toBeGreaterThan(1);
      const response = await fetch(`http://127.0.0.1:${address.port}/api/preview-jobs/${jobId}/content`, {
        headers: { "x-pdm-preview-worker-token": process.env.PDM_PREVIEW_WORKER_TOKEN!, "x-pdm-preview-worker-id": "dev057-native-worker" }
      });
      expect(response.status).toBe(403);
      expect(createHash("sha256").update(await readFile(nativePreviewFixture)).digest("hex")).toBe(sourceHash);
    } finally {
      if (timer) clearTimeout(timer);
      stopOwnWorker();
      if (workerFinished) await workerFinished.catch(() => undefined);
      if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }, 150_000);
});
