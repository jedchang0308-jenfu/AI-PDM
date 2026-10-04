import { issueJenfuPrincipalSession, verifyJenfuPrincipalSession } from "@/lib/jenfu-principal-session";
import { JenfuPrincipalSessionRegistry } from "@/lib/jenfu-principal-session-registry";
import { getPlatformSessionKeyRing } from "@/lib/platform-session-key-ring";
import { getGoogleWorkspaceMfaTrustPolicy } from "@/lib/auth-config";
import { principalAssurancePolicyHash } from "@/lib/jenfu-principal-assurance";
import { validatePrincipalPublishedGrantSnapshot } from "@/lib/jenfu-principal-published-grant-validation";
import { validateEffectiveRoleAssignment } from "@/lib/jenfu-entitlement-contract";
import { JenfuEntitlementRepository } from "@/lib/repositories/jenfu-entitlement-repository";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getAsyncDatabaseClient, type AsyncDatabaseQueryParams } from "@/lib/db-async-provider";
import { GET as readProcurement } from "@/app/api/integrations/procurement/releases/route";
import { GET as readProcurementPackage } from "@/app/api/integrations/procurement/releases/[id]/package/route";
import { GET as readCanonicalFile } from "@/app/api/pdm/file-assets/[fileAssetId]/route";
import { POST as claimWorkerJob } from "@/app/api/preview-jobs/claim/route";
import { GET as readWorkerContent } from "@/app/api/preview-jobs/[jobId]/content/route";
import { POST as heartbeatWorkerJob } from "@/app/api/preview-jobs/[jobId]/heartbeat/route";
import { POST as completeWorkerJob } from "@/app/api/preview-jobs/[jobId]/complete/route";
import { POST as createRecognition } from "@/app/api/numbering/recognition-sessions/route";
import { POST as claimRecognition } from "@/app/api/recognition-jobs/claim/route";
import { POST as heartbeatRecognition } from "@/app/api/recognition-jobs/[sessionId]/heartbeat/route";
import { GET as readRecognitionContent } from "@/app/api/recognition-jobs/[sessionId]/sources/[sourceId]/content/route";
import { POST as completeRecognition } from "@/app/api/recognition-jobs/[sessionId]/complete/route";
import { GET as readDocumentManagerCredential } from "@/app/api/preview-workers/solidworks-document-manager-key/route";
import { buildFilenameAdapterResult, buildUnsupportedAdapterResult, type DrawingRecognitionWorkerJob } from "@/lib/drawing-recognition-adapters";
import { AsyncHandoffRepository, SELECT_ASYNC_MANUFACTURING_HANDOFF_SUBMISSION_IDS_SQL } from "@/lib/repositories/handoff-async-repository";
import { SELECT_ASYNC_SUBMISSION_DETAIL_SQL, SELECT_ASYNC_SUBMISSION_FILES_SQL, SELECT_ASYNC_SUBMISSION_APPROVALS_SQL,
  SELECT_ASYNC_SUBMISSION_RELEASE_PACKAGE_SQL } from "@/lib/repositories/submission-list-async-repository";
import { NumberStateFlowError } from "@/lib/number-state-flow-contract";
import { createReleasePackageStorageService, LocalRepositoryStorageAdapter } from "@/lib/file-storage";
import { POST as createTransfer } from "@/app/api/transfer-packages/route";
import { POST as addTransferItem } from "@/app/api/transfer-packages/[id]/items/route";
import { POST as submitTransfer } from "@/app/api/transfer-packages/[id]/submit-review/route";
import { POST as decideTransfer } from "@/app/api/approvals/requests/[requestId]/decisions/route";
import { buildTransferPackageReadiness } from "@/lib/transfer-package-phase1d";
import { PartChangeWorkAsyncRepository } from "@/lib/repositories/part-change-work-async-repository";
import { DrawingRevisionWorkAsyncRepository } from "@/lib/repositories/drawing-revision-work-async-repository";
import { POST as createRecord } from "@/app/api/numbering/records/route";
import { readPartNumberMatrixWorkspace } from "@/lib/part-number-matrix-workspace";
import { GET as readMatrix } from "@/app/api/pdm/parts/[partId]/matrix-workspace/route";
import { POST as createPartWork } from "@/app/api/pdm/parts/[partId]/change-works/route";
import { GET as readPartWork, PATCH as updatePartWork } from "@/app/api/pdm/part-change-works/[workId]/route";
import { POST as submitPart } from "@/app/api/pdm/part-change-works/[workId]/submit/route";
import { GET as readDrawingWork, PATCH as updateDrawingWork } from "@/app/api/pdm/drawing-revision-works/[workId]/route";
import { GET as readDrawingTargets } from "@/app/api/pdm/drawings/[drawingId]/revision-targets/route";
import { GET as readDrawingWorkbench } from "@/app/api/numbering/drawings/workbench/route";
import { GET as readRelationMatrix, PATCH as updateRelationMatrix } from "@/app/api/pdm/relations/[rootId]/matrix/route";
import { POST as createDrawingWork } from "@/app/api/pdm/drawings/[drawingId]/revision-works/route";
import { POST as uploadDrawingFile } from "@/app/api/pdm/drawing-revision-works/[workId]/files/route";
import { GET as listPartAttachments, POST as uploadPartAttachment } from "@/app/api/parts/[partNumber]/attachments/route";
import { POST as submitDrawing } from "@/app/api/pdm/drawing-revision-works/[workId]/submit/route";
import { GET as inbox } from "@/app/api/approvals/inbox/route";
import { GET as readReview } from "@/app/api/pdm/review-requests/[requestId]/route";
import { POST as decideReview } from "@/app/api/pdm/review-requests/[requestId]/decisions/route";
import { issueCanonicalWorkbenchContract } from "@/lib/pdm-workbench-authority-control";
import { reviewPackageHash, reviewDecisionBasisHash } from "@/lib/pdm-review-package";
import { dev087RequestHash } from "@/lib/pdm-canonical-command";
import type { ReviewPackageEnvelope } from "@/lib/pdm-review-package-contract";
import { sanitizeDrawingRevisionWorkPayload } from "@/lib/drawing-revision-work-payload";
const enabled = Boolean(process.env.DEV122_NATIVE_SUITE);
const lifecycleEnabled = enabled && ["lifecycle", "ui", "all"].includes(process.env.DEV122_NATIVE_SUITE!);
const filesEnabled = enabled && ["files", "all"].includes(process.env.DEV122_NATIVE_SUITE!);
const procurementEnabled = enabled && ["procurement", "all"].includes(process.env.DEV122_NATIVE_SUITE!);
const db=enabled?getAsyncDatabaseClient():null;
let ownerToken = "", reviewerToken = "", deniedToken = "",otherToken="";
function request(url:string,token=ownerToken,method="GET",body?:object,version=1,contract="",key=url) {
  return new Request("https://ai-pdm.test"+url,{method,headers:{cookie:"__session="+token,
    "content-type":"application/json","if-match":String(version),"x-pdm-workbench-contract":contract,"idempotency-key":key},
    body:body?JSON.stringify(body):undefined});
}
async function ok<T>(response:Response,status=200):Promise<T>{
  expect(response.status,await response.clone().text()).toBe(status);return response.json();
}
type Work={data:{workId:string;rowVersion:number;payload:Record<string,unknown>};meta:{contractToken:string}};
type Submission={data:{requestId:string;rowVersion:number}};
async function contract(actorId:string,companyId="company-jenfu"){
  return db!.transaction(tx=>issueCanonicalWorkbenchContract(tx,{companyId,actorId}),{readOnly:true});
}
async function completeReview(submission:Submission,decision:"approve"|"return_for_correction") {
  const id=submission.data.requestId,params={params:Promise.resolve({requestId:id})};
  const pending=await ok<Record<string,unknown>>(await inbox(request("/api/approvals/inbox",reviewerToken)));
  expect(JSON.stringify(pending)).toContain(id);
  await ok(await readReview(request("/api/pdm/review-requests/"+id,reviewerToken),params));
  const ownerAttempt=await decideReview(request("/api/pdm/review-requests/"+id+"/decisions",ownerToken,"POST",
    {decision},submission.data.rowVersion,await contract("dev122-profile-owner")),params);
  expect(ownerAttempt.status).toBe(404);
  expect(await db!.queryOne("SELECT id FROM pdm_work_review_requests WHERE id=:id",{id})).toBeTruthy();
  const reviewerContract=await contract("dev122-profile-reviewer");
  const perform=()=>decideReview(request("/api/pdm/review-requests/"+id+"/decisions",reviewerToken,"POST",
    {decision},submission.data.rowVersion,reviewerContract),params);
  await ok(await perform());await ok(await perform());
  expect(await db!.queryOne("SELECT id FROM pdm_work_review_requests WHERE id=:id",{id})).toBeNull();
  const receipt=await db!.queryOne<{principal_id:string;actor_id:string;command_status:string}>(
    "SELECT principal_id,actor_id,command_status FROM platform_command_receipts WHERE effect_key=:effect AND command_name=:commandName",
    {effect:"review:"+id,commandName:"dev087:review.decision"});
  expect(receipt).toMatchObject({principal_id:"dev122-principal-reviewer",actor_id:"dev122-profile-reviewer",command_status:"completed"});
}
beforeAll(async () => {
  if (!enabled) return;
  const modes = { PDM_AUTH_MODE: process.env.PDM_AUTH_MODE, PDM_JENFU_PLATFORM_AUTH_MODE: process.env.PDM_JENFU_PLATFORM_AUTH_MODE,
    PDM_JENFU_ENTITLEMENT_MODE: process.env.PDM_JENFU_ENTITLEMENT_MODE };
  expect(modes).toEqual({ PDM_AUTH_MODE: "firebase_bff", PDM_JENFU_PLATFORM_AUTH_MODE: "on", PDM_JENFU_ENTITLEMENT_MODE: "enforce" });
  await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "native-authorization-mode-readback.json"), JSON.stringify(modes));
  const dsn = new URL(process.env.PDM_POSTGRES_URL!);
  expect(dsn.hostname).toBe("127.0.0.1");
  expect(dsn.username).toBe("dev122_runtime");
  expect(dsn.pathname).toMatch(/^\/dev122_[a-f0-9]{16}$/u);
  const taskRoot = process.env.DEV122_RUNTIME_ROOT!;
  expect(path.resolve(process.env.PDM_DATA_DIR!)).toBe(path.join(taskRoot, "data"));
  expect(path.resolve(process.env.PDM_REPOSITORY_DIR!)).toBe(path.join(taskRoot, "repository"));
  expect(await fs.readFile(path.join(taskRoot, "owner-marker"), "utf8")).toBe("AIPDM_DEV122_LOCAL_V1");
  const ring = getPlatformSessionKeyRing();
  const now = Math.floor(Date.now() / 1000);
  const tokens: Record<string, string> = {};
  for (const identity of (["authority-gaps","other-company-scope"].includes(process.env.DEV122_NATIVE_SELECTION??"")?["owner", "reviewer", "denied","other"]:["owner", "reviewer", "denied"])) {
    const token = issueJenfuPrincipalSession({
      principalId: "dev122-principal-" + identity, employeeId: "dev122-employee-" + identity,
      identityIssuer: "https://securetoken.google.com/dev122-local-fixture",
      identitySubject: "dev122-subject-" + identity, authEpoch: 1,
      accountLifecycleVersion: 1, profileVersion: 1, companyId: identity==="other"?"company-dev122-other":"company-jenfu",
      authenticatedAt: now, assuranceLevel: "aal2", secondFactor: "totp",
      assurancePolicyHash: principalAssurancePolicyHash(getGoogleWorkspaceMfaTrustPolicy())
    }, ring, now);
    const claims = verifyJenfuPrincipalSession(token, ring, { nowSeconds: now });
    await new JenfuPrincipalSessionRegistry(db!).register(claims);
    expect(await new JenfuPrincipalSessionRegistry(db!).isActive(claims)).toBe(true);
    tokens[identity] = token;
  }
  ownerToken = tokens.owner; reviewerToken = tokens.reviewer; deniedToken = tokens.denied;otherToken=tokens.other??"";
  // Runtime-only credential artifact: kept in the marked task directory, removed by runner cleanup.
  await fs.writeFile(path.join(taskRoot, "signed-sessions.json"), JSON.stringify(tokens));
});
afterAll(async()=>{await db?.close();});

async function fixtureMutation(purpose: string, sql: string, params: Record<string, unknown>) {
  await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "fixture-mutations.jsonl"), JSON.stringify({
    project: "AIPDM", purpose, scope: "own disposable native PG", sql, params, producerBoundary: "FIXTURE"
  }) + "\n");
  await db!.execute(sql, params);
}

let fixtureRequestOutstanding = false;
async function fixtureParentAction(action: "expire" | "restore" | "owned-lifecycle-snapshot") {
  expect(fixtureRequestOutstanding).toBe(false); fixtureRequestOutstanding = true;
  const taskRoot = process.env.DEV122_RUNTIME_ROOT!, nonce = crypto.randomUUID();
  const requestPath = path.join(taskRoot, "grant-fixture-request.json"), resultPath = path.join(taskRoot, "grant-fixture-result.json");
  expect(await fs.readFile(path.join(taskRoot, "owner-marker"), "utf8")).toBe("AIPDM_DEV122_LOCAL_V1");
  try {
    await fs.rm(resultPath, { force: true });
    const temporary = requestPath + ".tmp";
    await fs.writeFile(temporary, JSON.stringify({ action, nonce })); await fs.rename(temporary, requestPath);
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const result = await fs.readFile(resultPath, "utf8").then(text => JSON.parse(text)).catch(error => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error;
      });
      if (result?.nonce === nonce) {
        expect(result.action).toBe(action); expect(result.status).toBe("APPLIED");
        return result;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("DEV122_FIXTURE_GRANT_CHANNEL_TIMEOUT");
  } finally { fixtureRequestOutstanding = false; }
}

async function fixtureGrantAction(action: "expire" | "restore") {
  const result = await fixtureParentAction(action);
  expect(result.rowCount).toBe(1); expect(result.after).toHaveLength(1);
  expect(result.after[0]).toMatchObject({ assignment_id: "dev122-assignment-reviewer",
    principal_id: "dev122-principal-reviewer", scope_kind: "workspace", scope_key: "company-jenfu", application_id: "ai-pdm" });
  return result;
}

// Fault callback runs only after the exact real dependency SELECT completes.
// It does not supply rows, mock a repository, replace a route or alter transactions.
async function withNativeReadFault<T>(targetSql: string | ((sql: string) => boolean), error: Error, action: () => Promise<T>) {
  const original = db!.query.bind(db!);
  let reached = 0;
  const fault = vi.spyOn(db!, "query").mockImplementation(async <Row>(sql: string, params?: AsyncDatabaseQueryParams): Promise<Row[]> => {
    const rows = await original<Row>(sql, params);
    if (typeof targetSql === "string" ? sql === targetSql : targetSql(sql)) { reached += 1; throw error; }
    return rows;
  });
  try { return await action(); }
  finally { fault.mockRestore(); expect(reached, "actual native dependency completed before fault callback").toBeGreaterThan(0); }
}

const procurementTarget = "dev122-i-target-latest";
const procurementArchive = Buffer.from("504b05060000000000000000000000000000000000000000", "hex");
let procurementSeeded = false;
async function seedProcurementReadHistory() {
  if (procurementSeeded) return;
  // Explicit historical read prerequisites only. These are never P/G release evidence.
  await fixtureMutation("I01 historical item read prerequisite", `INSERT INTO items(id,company_id,part_number,part_name)
    VALUES(:id,'company-jenfu',:partNumber,'DEV122 historical procurement')`, { id: "dev122-i-target-item", partNumber: "DEV122-I-TARGET" });
  const records = [
    { id: "dev122-i-target-old", item: "dev122-i-target-item", company: "company-jenfu", released: "2026-09-01T00:00:00Z" },
    { id: procurementTarget, item: "dev122-i-target-item", company: "company-jenfu", released: "2026-09-03T00:00:00Z" },
    // Reachable legacy history with a newer other-company row sharing the item FK.
    // Its exact scope is a negative input; it cannot suppress the authorized row.
    { id: "dev122-i-other-newer", item: "dev122-i-target-item", company: "company-dev122-other", released: "2026-09-04T00:00:00Z" }
  ];
  for (let index = 0; index < 202; index += 1) {
    const id = "dev122-i-bulk-" + String(index).padStart(3, "0");
    await fixtureMutation("I01 bounded scan historical item", `INSERT INTO items(id,company_id,part_number,part_name)
      VALUES(:id,'company-jenfu',:partNumber,'DEV122 bounded scan')`, { id, partNumber: "DEV122-I-BULK-" + index });
    records.push({ id, item: id, company: "company-jenfu", released: "2026-09-02T00:00:00Z" });
  }
  for (const row of records) await fixtureMutation("I01 explicit historical Released read input; not a lifecycle outcome", `INSERT INTO submissions
    (id,company_id,item_id,drawing_number,revision,material,surface_finish,document_type,change_description,status,submitted_by,released_at)
    VALUES(:id,:company,:item,:id,'1.0','SUS304','none','part','historical read fixture','Released','dev122-profile-owner',:released)`, row);
  const stored = await createReleasePackageStorageService().putObject({ key: "dev122/i01/history.zip", bytes: procurementArchive, contentType: "application/zip" });
  await fixtureMutation("I01 lawful stored historical package read input", `INSERT INTO release_packages
    (id,submission_id,package_filename,local_path,storage_key,sha256,file_size,manifest_json,created_by)
    VALUES('dev122-i-package',:submission,'history.zip',:localPath,:key,:hash,:size,CAST(:manifest AS jsonb),'dev122-profile-owner')`,
    { submission: procurementTarget, localPath: stored.localPath, key: stored.key, hash: stored.sha256, size: stored.bytes, manifest: JSON.stringify({ boundary: "historical read fixture" }) });
  await fixtureMutation("I01 historical attachment read prerequisite", `INSERT INTO submission_files
    (id,submission_id,file_role,original_filename,local_path,sha256,file_size)
    VALUES('dev122-i-file',:submission,'other','history.zip',:localPath,:hash,:size)`,
    { submission: procurementTarget, localPath: stored.localPath, hash: stored.sha256, size: stored.bytes });
  await fixtureMutation("I01 historical approval read prerequisite", `INSERT INTO approval_steps
    (id,submission_id,reviewer_id,decision) VALUES('dev122-i-approval',:submission,'dev122-profile-reviewer','Approved')`, { submission: procurementTarget });
  procurementSeeded = true;
}

type ProcurementBody = { integration: string; schema_version: number; generated_at: string; count: number;
  entries: Array<{ submission_id: string; part_number: string; files: unknown[]; approvals: unknown[];
    package: null | { download_url: string; sha256: string; file_size: number | string } }> };
describe.runIf(procurementEnabled)("DEV122 I01 actual signed procurement route/service/native PostgreSQL", () => {
  it.each(["missing", "company_drift"] as const)("captures actual original hydration %s after completed native ID query", async variant => {
    const id = "dev122-i-hydration-" + variant, item = id + "-item", number = "DEV122-I-HYDRATION-" + variant;
    await fixtureMutation("I01 independent historical item prerequisite", "INSERT INTO items(id,company_id,part_number,part_name) VALUES(:id,'company-jenfu',:number,'Hydration historical input')", { id: item, number });
    await fixtureMutation("I01 independent historical Released read prerequisite; not P/G release outcome", `INSERT INTO submissions
      (id,company_id,item_id,drawing_number,revision,material,surface_finish,document_type,change_description,status,submitted_by,released_at)
      VALUES(:id,'company-jenfu',:item,:number,'1.0','SUS304','none','part','Historical hydration input','Released','dev122-profile-owner','2026-09-05T00:00:00Z')`, { id, item, number });
    const originalQuery = db!.query.bind(db!); let listCompleted = 0, detailCompleted = 0, actualDetail: unknown, mutated = false;
    const observe = vi.spyOn(db!, "query").mockImplementation(async <Row>(sql: string, params?: AsyncDatabaseQueryParams): Promise<Row[]> => {
      const rows = await originalQuery<Row>(sql, params);
      if (sql === SELECT_ASYNC_MANUFACTURING_HANDOFF_SUBMISSION_IDS_SQL) {
        listCompleted += 1; expect(rows).toEqual([{ id }]);
        if (variant === "missing") await fixtureMutation("I01 actual disappearance between completed ID query and real detail hydration", "DELETE FROM submissions WHERE id=:id AND company_id='company-jenfu'", { id });
        else await fixtureMutation("I01 actual cross-company drift between ID query and real detail hydration", "UPDATE submissions SET company_id='company-dev122-other' WHERE id=:id AND company_id='company-jenfu'", { id });
        mutated = true;
      }
      if (sql === SELECT_ASYNC_SUBMISSION_DETAIL_SQL) { detailCompleted += 1; actualDetail = rows; }
      return rows;
    });
    try {
      const response = await readProcurement(request("/api/integrations/procurement/releases?partNumber=" + number));
      const body = await response.json();
      await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "procurement-hydration-readbacks.jsonl"), JSON.stringify({
        phase: process.env.DEV122_PROCUREMENT_HYDRATION_PHASE === "original" ? "ORIGINAL_ACTUAL_SOURCE" : "FIXED_CURRENT_SOURCE",
        variant, actualListCompleted: listCompleted, actualDetailCompleted: detailCompleted, actualDetail, mutationApplied: mutated,
        route: { status: response.status, body, cacheControl: response.headers.get("cache-control"), contentType: response.headers.get("content-type") }, helperSourceHash: createHash("sha256").update(await fs.readFile("src/lib/handoff-async.ts")).digest("hex"),
        actualRow: await originalQuery("SELECT id,company_id FROM submissions WHERE id=:id", { id }) }) + "\n");
      if (process.env.DEV122_PROCUREMENT_HYDRATION_PHASE === "original") {
        expect(response.status).toBe(200); expect(body).toMatchObject({ count: 0, entries: [] });
      } else {
        expect(response.status).toBe(500); expect(body).toMatchObject({ error: { code: "number_state_internal", retryable: false } });
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("content-type")).toMatch(/^application\/json(?:;|$)/u);
        expect(JSON.stringify(body)).not.toMatch(/DEV122|SELECT|stack/u);
      }
      if (variant === "missing") expect(actualDetail).toEqual([]);
      else expect(actualDetail).toEqual([expect.objectContaining({ company_id: "company-dev122-other" })]);
    } finally {
      observe.mockRestore(); expect(listCompleted).toBe(1); expect(detailCompleted).toBe(1); expect(mutated).toBe(true);
      // Remove only this independent historical input; never alter lifecycle-produced outcomes.
      await fixtureMutation("I01 exact independent historical input cleanup", "DELETE FROM submissions WHERE id=:id", { id });
      await fixtureMutation("I01 exact independent historical item cleanup", "DELETE FROM items WHERE id=:id", { id: item });
    }
  });
  it("reads a documented empty baseline, then nonempty latest company history with real package hydration and audited bytes", async () => {
    expect(await db!.queryOne("SELECT count(*)::int AS count FROM submissions WHERE status='Released'")).toMatchObject({ count: 0 });
    expect(await ok<ProcurementBody>(await readProcurement(request("/api/integrations/procurement/releases")))).toMatchObject({ integration: "procurement", count: 0, entries: [] });
    await seedProcurementReadHistory();
    const response = await readProcurement(request("/api/integrations/procurement/releases?partNumber=%20dev122-i-target%20"));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await ok<ProcurementBody>(response);
    expect(body).toMatchObject({ integration: "procurement", schema_version: 1, count: 1 });
    expect(Number.isFinite(Date.parse(body.generated_at))).toBe(true);
    expect(body.entries[0]).toMatchObject({ submission_id: procurementTarget, part_number: "DEV122-I-TARGET" });
    expect(body.entries[0].files).toHaveLength(1); expect(body.entries[0].approvals).toHaveLength(1);
    expect(body.entries[0].package?.sha256).toBe(createHash("sha256").update(procurementArchive).digest("hex"));
    const download = await readProcurementPackage(request(body.entries[0].package!.download_url), { params: Promise.resolve({ id: procurementTarget }) });
    expect(download.status).toBe(200); expect(Buffer.from(await download.arrayBuffer())).toEqual(procurementArchive);
    expect(await db!.queryOne("SELECT id FROM audit_logs WHERE action='StorageAccessed' AND submission_id=:id", { id: procurementTarget })).toBeTruthy();
    expect((await readProcurementPackage(request("/api/integrations/procurement/releases/dev122-i-target-old/package"),
      { params: Promise.resolve({ id: "dev122-i-target-old" }) })).status).toBe(404);
  });
  it("enforces actual nullable/non-null submitter, company/latest, filters and bounded 200-row scan", async () => {
    await seedProcurementReadHistory();
    const repo = new AsyncHandoffRepository(db!);
    const ids = await repo.listManufacturingHandoffSubmissionIds({ companyId: "company-jenfu", limit: 1000 });
    expect(ids).toHaveLength(200); expect(ids).toContain(procurementTarget);
    expect(ids).not.toContain("dev122-i-target-old"); expect(ids).not.toContain("dev122-i-other-newer");
    expect(await repo.listManufacturingHandoffSubmissionIds({ companyId: "company-jenfu", submittedBy: "dev122-profile-owner", limit: 1000 })).toEqual(ids);
    expect(await repo.listManufacturingHandoffSubmissionIds({ companyId: "company-jenfu", submittedBy: "not-a-submitter" })).toEqual([]);
    for (const [limit, count] of [["0", 1], ["1", 1], ["2", 2], ["1000", 200], ["invalid", 100]] as const) {
      expect((await ok<ProcurementBody>(await readProcurement(request("/api/integrations/procurement/releases?limit=" + limit)))).count).toBe(count);
    }
    const targetUrl = "/api/integrations/procurement/releases?partNumber=DEV122-I-TARGET";
    expect((await ok<ProcurementBody>(await readProcurement(request(targetUrl + "&since=2026-09-03T00%3A00%3A00Z")))).count).toBe(0);
    expect((await ok<ProcurementBody>(await readProcurement(request(targetUrl + "&since=invalid")))).count).toBe(1);
    expect((await ok<ProcurementBody>(await readProcurement(request("/api/integrations/procurement/releases?partNumber=absent")))).count).toBe(0);
    expect((await readProcurement(request(targetUrl, ""))).status).toBe(401);
    expect((await readProcurement(request(targetUrl, deniedToken))).status).toBe(403);
  });
  it.each([
    ["list", SELECT_ASYNC_MANUFACTURING_HANDOFF_SUBMISSION_IDS_SQL], ["detail", SELECT_ASYNC_SUBMISSION_DETAIL_SQL],
    ["files", SELECT_ASYNC_SUBMISSION_FILES_SQL], ["approvals", SELECT_ASYNC_SUBMISSION_APPROVALS_SQL],
    ["package", SELECT_ASYNC_SUBMISSION_RELEASE_PACKAGE_SQL]
  ])("returns exact safe500 after the actual native %s dependency faults instead of empty success", async (_name, sql) => {
    await seedProcurementReadHistory();
    const before = await ownedLifecycleSnapshot();
    const response = await withNativeReadFault(sql, new Error("DEV122_NATIVE_PRIVATE_SQL_FAULT"), () =>
      readProcurement(request("/api/integrations/procurement/releases?partNumber=DEV122-I-TARGET")));
    expect(response.status).toBe(500); expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json(); expect(body).toMatchObject({ error: { code: "number_state_internal", retryable: false } });
    expect(JSON.stringify(body)).not.toMatch(/DEV122_NATIVE|SELECT|stack/u);
    expect(await ownedLifecycleSnapshot()).toEqual(before);
  });
  it("preserves a typed dependency503 after native query completion", async () => {
    await seedProcurementReadHistory();
    const response = await withNativeReadFault(SELECT_ASYNC_MANUFACTURING_HANDOFF_SUBMISSION_IDS_SQL,
      new NumberStateFlowError("dev122_dependency_unavailable", "Dependency temporarily unavailable", 503, true), () => readProcurement(request("/api/integrations/procurement/releases")));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "dev122_dependency_unavailable", retryable: true } });
  });
});

type FileFixture = { workId: string; bindingId: string; assetId: string; bytes: Buffer; url: string;
  asset: { id: string; content_hash: string; file_size: number | string; storage_key: string; original_path: string } };
async function normalDrawingFile(label: string, extension = "SLDDRW", actualSourceBytes?: Buffer): Promise<FileFixture> {
  const created = await ok<{ drawingNumber: { id: string } }>(await createRecord(request("/api/numbering/records", ownerToken, "POST",
    { coreName: "DEV122 file " + label, itemKind: "manufactured", structureType: "single_part", drawingRequested: true, drawingPurposeCode: "M" }, 1, "", "file-number-" + label)), 201);
  const row = await db!.queryOne<{ id: string }>(`SELECT work.id FROM drawing_revision_works work JOIN drawings drawing ON drawing.id=work.drawing_id
    WHERE drawing.formal_drawing_number_id=:id`, { id: created.drawingNumber.id });
  expect(row).toBeTruthy(); const workId = row!.id, params = { params: Promise.resolve({ workId }) };
  const work = await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/" + workId), params));
  const bytes = actualSourceBytes ?? Buffer.from("DEV122 normal uploaded protocol bytes " + label + "." + extension);
  const form = new FormData(); form.set("file", new File([new Uint8Array(bytes)], label + "." + extension, { type: "application/octet-stream" }));
  const uploaded = await ok<{ data: { file: { id: string; sourceFileAssetId: string } } }>(await uploadDrawingFile(new Request(
    "https://ai-pdm.test/api/pdm/drawing-revision-works/" + workId + "/files", { method: "POST", headers: {
      cookie: "__session=" + ownerToken, "if-match": String(work.data.rowVersion), "x-pdm-workbench-contract": work.meta.contractToken,
      "idempotency-key": label + "-file-upload" }, body: form }), params));
  const bindingId = uploaded.data.file.id, assetId = uploaded.data.file.sourceFileAssetId;
  const asset = await db!.queryOne<FileFixture["asset"]>("SELECT id,content_hash,file_size,storage_key,original_path FROM file_assets WHERE id=:id", { id: assetId });
  expect(asset).toBeTruthy(); expect(asset!.content_hash).toBe(createHash("sha256").update(bytes).digest("hex"));
  expect(Number(asset!.file_size)).toBe(bytes.length);
  const url = "/api/pdm/file-assets/" + assetId + "?context=drawing_revision_work&contextId=" + workId + "&bindingId=" + bindingId;
  return { workId, bindingId, assetId, bytes, url, asset: asset! };
}
const realCadInputs = [
  { extension: "SLDPRT", relative: "data/repository/candidate-revisions/company-jenfu/NCR-58d69728-cc3f-4d97-95fb-2957f62630d8/NCRF-a8ebd160-9779-43ae-be1b-17ca00fcd759-A0029.SLDPRT", bytes: 114885,
    hash: "d3f2349aa36baf24d3e7fc0044cd2004897e62137bbb279b5da329f6521dfc39" },
  { extension: "SLDASM", relative: "data/repository/master-attachments/drawing-number/A0011-M01/2026/08/15dc3846-a407-44e7-bd9e-10ab7541afc3-A0053.SLDASM", bytes: 174437,
    hash: "a742e01991a82f08170e82fb137819bb0b1b4ebad8096fe035f841c383385694" },
  { extension: "SLDDRW", relative: "data/repository/candidate-revisions/company-jenfu/NCR-58d69728-cc3f-4d97-95fb-2957f62630d8/NCRF-e1e1a32a-322d-4504-bcdc-7d565fc39876-A0029-M01.SLDDRW", bytes: 171795,
    hash: "06fd8358ce29411ea49ae466e1404b0ecc2fc964bbc98534d2df897ab09453bd" }
] as const;
type NativeProcessIdentity = { pid: number; executable: string; startToken: string };
function nativeProcessIdentity(pid: number): NativeProcessIdentity {
  return JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-Command",
    `$p=Get-Process -Id ${Number(pid)} -ErrorAction Stop; @{pid=$p.Id;executable=$p.Path;startToken=$p.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()}|ConvertTo-Json -Compress`],
    { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }));
}
function nativeProcessMatches(expected: NativeProcessIdentity) {
  try { const actual = nativeProcessIdentity(expected.pid); return actual.startToken === expected.startToken && actual.executable.toLowerCase() === expected.executable.toLowerCase(); }
  catch { return false; }
}
function cadGovernor(action: "register" | "release", identity: NativeProcessIdentity) {
  const args = [process.env.DEV122_GOVERNOR_SCRIPT!, "--agent-host", "codex", "--format", "json", "session", "runtime", action,
    "--session", process.env.DEV122_GOVERNOR_SESSION!, "--pid", String(identity.pid), "--start-token", identity.startToken];
  if (action === "register") args.push("--executable", identity.executable, "--purpose", "AI-PDM DEV122 fresh Shell CAD extraction after actual authenticated content",
    "--cleanup-condition", "45s bounded worker exit; verified task process tree stopped and own temp removed");
  else args.push("--reason", "exited");
  const result = JSON.parse(execFileSync(process.env.DEV122_GOVERNOR_PYTHON!, args, { encoding: "utf8", windowsHide: true }));
  expect(result.exit_code).toBe(0); return result;
}
async function extractFreshCadSource(extension: string, bytes: Buffer) {
  expect(process.platform).toBe("win32");
  const runtime = process.env.DEV122_RUNTIME_ROOT!, evidence = process.env.DEV122_EVIDENCE_ROOT!;
  const own = path.join(runtime, "cad-" + crypto.randomUUID()), marker = "AIPDM_DEV122_FRESH_CAD_V1";
  await fs.mkdir(own); await fs.writeFile(path.join(own, "owner-marker"), marker);
  const source = path.join(own, "claimed-source." + extension), output = path.join(own, "fresh-thumbnail.png");
  await fs.writeFile(source, bytes);
  const ready = path.join(own, "registered.ready"), argv = path.join(own, "worker-args.json"), wrapper = path.join(own, "worker.ps1");
  await fs.writeFile(argv, JSON.stringify(["scripts/run-windows-shell-preview-worker.mjs", "--source", source, "--out", output, "--size", "512"]));
  await fs.writeFile(wrapper, `param([string]$Ready,[string]$NodeExe,[string]$ArgsFile)\n$deadline=[DateTime]::UtcNow.AddSeconds(15)\nwhile(-not(Test-Path -LiteralPath $Ready)){if([DateTime]::UtcNow -gt $deadline){throw 'DEV122_CAD_HANDSHAKE_TIMEOUT'};Start-Sleep -Milliseconds 100}\n$dev122Args=Get-Content -LiteralPath $ArgsFile -Raw|ConvertFrom-Json\n& $NodeExe @dev122Args\nexit $LASTEXITCODE\n`);
  const ledger: Record<string, unknown> = { project: "AIPDM", purpose: "Fresh original Shell CLI extraction after normal upload and native authenticated content",
    port: null, owningProcessTree: null, cleanupCondition: "45s bounded exit and verified own directory removal", PDM_DATA_DIR: process.env.PDM_DATA_DIR,
    PDM_REPOSITORY_DIR: process.env.PDM_REPOSITORY_DIR, TEMP: own, source, output, sourceHash: createHash("sha256").update(bytes).digest("hex"),
    workerHash: createHash("sha256").update(await fs.readFile("scripts/run-windows-shell-preview-worker.mjs")).digest("hex"),
    extractorHash: createHash("sha256").update(await fs.readFile("scripts/windows-shell-thumbnail-extractor.ps1")).digest("hex") };
  const ledgerPath = path.join(evidence, "cad-worker-" + extension + ".json");
  const save = () => fs.writeFile(ledgerPath, JSON.stringify(ledger, null, 2)); await save();
  let identity: NativeProcessIdentity | undefined, registered = false, timer: ReturnType<typeof setTimeout> | undefined;
  let child: ReturnType<typeof spawn> | undefined, stdout = "", stderr = "";
  try {
    child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", wrapper, "-Ready", ready, "-NodeExe", process.execPath, "-ArgsFile", argv],
      { cwd: process.cwd(), env: { ...process.env, NODE_OPTIONS: "", TEMP: own, TMP: own }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout!.on("data", chunk => { stdout += chunk; }); child.stderr!.on("data", chunk => { stderr += chunk; });
    const done = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child!.once("error", reject); child!.once("exit", (code, signal) => resolve({ code, signal }));
    });
    identity = nativeProcessIdentity(child.pid!); ledger.owningProcessTree = { wrapper: identity, children: "Original Node Shell worker and original PowerShell extractor" }; await save();
    ledger.governorRegister = cadGovernor("register", identity); registered = true; await fs.writeFile(ready, marker);
    timer = setTimeout(() => { ledger.timeout = true; if (identity && nativeProcessMatches(identity)) execFileSync("taskkill", ["/PID", String(identity.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); }, 45_000);
    ledger.exit = await done; clearTimeout(timer);
    ledger.stdout = stdout; ledger.stderr = stderr; await save();
    expect(ledger.timeout).not.toBe(true); expect((ledger.exit as { code: number }).code, stderr).toBe(0);
    const actual = JSON.parse(stdout); expect(actual.mode).toBe("source"); expect(actual.quality.visiblePixels).toBeGreaterThanOrEqual(100);
    expect(actual.quality.uniqueColorBuckets >= 8 || actual.quality.luminanceVariance >= 180).toBe(true);
    const png = await fs.readFile(output); expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(createHash("sha256").update(await fs.readFile(source)).digest("hex")).toBe(ledger.sourceHash);
    ledger.quality = actual.quality; ledger.outputHash = createHash("sha256").update(png).digest("hex"); ledger.outputBytes = png.length;
    await fs.writeFile(path.join(evidence, "fresh-CAD-" + extension + ".png"), png); return png;
  } finally {
    clearTimeout(timer);
    if (identity && nativeProcessMatches(identity)) execFileSync("taskkill", ["/PID", String(identity.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    ledger.processDead = identity ? !nativeProcessMatches(identity) : true;
    if (registered && ledger.processDead) ledger.governorRelease = cadGovernor("release", identity!);
    expect(ledger.processDead).toBe(true);
    expect(path.dirname(own)).toBe(runtime); expect(await fs.readFile(path.join(own, "owner-marker"), "utf8")).toBe(marker);
    await fs.rm(own, { recursive: true }); ledger.tempRemoved = true; await save();
  }
}
async function fileResponse(fixture: FileFixture, preview = false, token = ownerToken) {
  return readCanonicalFile(request(fixture.url + (preview ? "&preview=1" : ""), token), { params: Promise.resolve({ fileAssetId: fixture.assetId }) });
}
async function currentFileJob(fixture: FileFixture) {
  const job = await db!.queryOne<Record<string, unknown>>("SELECT *,CAST(updated_at AS TEXT) AS exact_updated_at FROM preview_jobs WHERE source_file_asset_id=:id ORDER BY created_at DESC LIMIT 1", { id: fixture.assetId });
  expect(job).toBeTruthy(); return job!;
}
async function resetFileJob(fixture: FileFixture, status: string, attempt = 2, age = 0, clock = Date.now()) {
  const previous = await currentFileJob(fixture);
  expect(typeof previous.metadata_json).toBe("string");
  await fixtureMutation("F01 exact normal-upload job input reset; native timestamp trigger retained", "DELETE FROM preview_jobs WHERE id=:id", { id: previous.id });
  await fixtureMutation("F01 lawful worker state input; not a CAD output", `INSERT INTO preview_jobs
    (id,company_id,source_file_asset_id,source_content_hash,requested_kind,source_extension,status,attempt_count,idempotency_key,generator_profile,created_by,updated_at,error_code,priority,metadata_json,locked_by,locked_at)
    VALUES(:id,:company,:asset,:hash,:kind,:extension,:status,:attempt,:key,:generator,:creator,:updated,:error,-1000,:metadata,:holder,:lockedAt)`, {
    id: previous.id, company: previous.company_id, asset: previous.source_file_asset_id, hash: previous.source_content_hash,
    kind: previous.requested_kind, extension: previous.source_extension, status, attempt, key: previous.idempotency_key,
    generator: previous.generator_profile, creator: previous.created_by, updated: new Date(clock - age).toISOString(),
    error: status === "skipped" ? "unsupported_preview_source" : status === "failed" ? "dev122_worker_input_failure" : null,
    metadata: previous.metadata_json, // Preserve exact normal-upload provenance bytes; never invent a Principal.
    holder: status === "running" ? previous.locked_by : null, lockedAt: status === "running" ? previous.locked_at : null
  });
  const next = await currentFileJob(fixture);
  expect(clock - new Date(next.updated_at as string | Date).getTime()).toBe(age);
  expect(next).toMatchObject({ status, attempt_count: attempt });
  const provenance = ["company_id", "source_file_asset_id", "source_content_hash", "requested_kind", "source_extension", "idempotency_key",
    "generator_profile", "created_by", "metadata_json"];
  for (const field of provenance) expect(next[field], field).toEqual(previous[field]);
  await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "file-job-reset-readbacks.jsonl"), JSON.stringify({
    purpose: "Preserve actual normal-upload provenance during lawful worker-state input reset", previous, next, provenance, clock, expectedAge: age }) + "\n");
  return next;
}
describe.runIf(filesEnabled)("DEV122 F01 actual signed canonical file routes, storage and native worker protocol", () => {
  it("canonical preview rejects stale derivative source hash after actual protocol completion",async()=>{
    const fixture=await normalDrawingFile("stale-derivative-source");await resetFileJob(fixture,"queued",0);
    const token=Buffer.alloc(32,126).toString("base64url"),previous=process.env.PDM_WORKLOAD_AUTH_CREDENTIALS;
    process.env.PDM_WORKLOAD_AUTH_CREDENTIALS=JSON.stringify({schemaVersion:"ai-pdm.workload-credentials.v1",workloads:[{id:"dev122-stale-derivative",token,purposes:["preview_jobs"],capabilities:["solidworks_2d_preview_png"]}]});
    const workload=(url:string,body:object)=>new Request("https://ai-pdm.test"+url,{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify(body)});
    try{
      const claimed=await ok<{job:{jobId:string}}>(await claimWorkerJob(workload("/api/preview-jobs/claim",{supportedKinds:["native_thumbnail_png"],supportedExtensions:["slddrw"]})));
      expect(claimed.job.jobId).toBe(String((await currentFileJob(fixture)).id));
      const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSf8AAAAASUVORK5CYII=","base64");
      const completed=await ok<{accepted:boolean;derivativeIds:string[]}>(await completeWorkerJob(workload("/api/preview-jobs/"+claimed.job.jobId+"/complete",{
        status:"succeeded",sourceContentHash:fixture.asset.content_hash,derivatives:[{kind:"thumbnail_png",fileName:"stale-protocol.png",mimeType:"image/png",
          contentBase64:png.toString("base64"),generatorProfile:"dev122_protocol_fixture",generatorVersion:"PROTOCOL_ONLY"}]}),{params:Promise.resolve({jobId:claimed.job.jobId})}));
      expect(completed.accepted).toBe(true);expect(completed.derivativeIds).toHaveLength(1);
      const valid=await fileResponse(fixture,true);expect(valid.status).toBe(200);expect(Buffer.from(await valid.arrayBuffer())).toEqual(png);
      await fixtureMutation("F01 lawful stale derivative source-hash negative input after actual protocol completion; no CAD output claim",
        "UPDATE file_derivatives SET source_content_hash=:hash WHERE id=:id",{id:completed.derivativeIds[0],hash:"0".repeat(64)});
      const before=await ownedLifecycleSnapshot(),response=await fileResponse(fixture,true),body=await response.json();
      expect(response.status).toBe(409);expect(body).toMatchObject({error:{code:"PREVIEW_OUTPUT_MISSING",retryable:false}});
      expect(await ownedLifecycleSnapshot()).toEqual(before);
      const original=await fileResponse(fixture);expect(original.status).toBe(200);expect(Buffer.from(await original.arrayBuffer())).toEqual(fixture.bytes);
      await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"stale-derivative-source.json"),JSON.stringify({assetId:fixture.assetId,sourceHash:fixture.asset.content_hash,
        derivativeId:completed.derivativeIds[0],status:response.status,body,actualCADOutput:"NOT_RUN_PROTOCOL_FIXTURE",generation:null}));
    }finally{if(previous===undefined)delete process.env.PDM_WORKLOAD_AUTH_CREDENTIALS;else process.env.PDM_WORKLOAD_AUTH_CREDENTIALS=previous;}
  });
  it("review package immutable file bytes audit and scoped replacement denials use actual signed canonical routes", async () => {
    const fixture = await initialDrawingFixture("review-file-canonical"), submission = await submitNativeDrawing(fixture.workId);
    const row = await db!.queryOne<{snapshot_payload:ReviewPackageEnvelope;snapshot_hash:string}>("SELECT snapshot_payload,snapshot_hash FROM pdm_work_review_requests WHERE id=:id",{id:submission.data.requestId});
    const target = row!.snapshot_payload.targets.find(value=>value.workspace.entityId===fixture.drawingId);
    expect(target).toBeTruthy(); const file = target!.workspace.files[0]; expect(file.sourceFileAssetId).toBeTruthy();
    const asset = await db!.queryOne<{id:string;original_path:string;content_hash:string;file_size:number}>("SELECT id,original_path,content_hash,file_size FROM file_assets WHERE id=:id",{id:file.sourceFileAssetId});
    const sourcePath = path.resolve(asset!.original_path);
    expect(sourcePath.startsWith(path.resolve(process.env.PDM_REPOSITORY_DIR!)+path.sep)).toBe(true);
    const bytes = await fs.readFile(sourcePath), url = `/api/pdm/file-assets/${asset!.id}?context=review_package&contextId=${fixture.drawingId}&bindingId=${file.bindingId}&reviewRequestId=${submission.data.requestId}`;
    const perform = (token=reviewerToken,href=url)=>readCanonicalFile(request(href,token),{params:Promise.resolve({fileAssetId:asset!.id})});
    const response = await perform(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes); expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset!.content_hash);
    const audit = await db!.queryOne("SELECT detail_json FROM audit_logs WHERE action='StorageAccessed' AND detail_json->>'fileId'=:id ORDER BY created_at DESC LIMIT 1",{id:asset!.id});
    expect(audit).toMatchObject({detail_json:{securityPrincipalId:"dev122-principal-reviewer",historicalProfileId:"dev122-profile-reviewer",bytes:bytes.length,
      resourceContext:{context:"review_package",contextId:fixture.drawingId,bindingId:file.bindingId}}});
    const before = await ownedLifecycleSnapshot(), denials=[];
    for(const [token,href] of [[ownerToken,url],[reviewerToken,url.replace(submission.data.requestId,"unknown-review")],[reviewerToken,url.replace(file.bindingId,"unknown-binding")]]) {
      const denied = await perform(token,href); const body = await denied.json(); denials.push({status:denied.status,body});
      expect(denied.status).toBe(404); expect(await ownedLifecycleSnapshot()).toEqual(before);
    }
    await fs.writeFile(sourcePath,Buffer.from("DEV122 replaced source bytes"));
    let replaced;
    try { const rejected = await perform(); replaced={status:rejected.status,body:await rejected.json()};
      expect(rejected.status).toBe(503); expect(replaced.body).toMatchObject({error:{code:"PDM_FILE_UNAVAILABLE",retryable:false}});
      expect(await ownedLifecycleSnapshot()).toEqual(before);
    } finally {await fs.writeFile(sourcePath,bytes);}
    expect(await db!.queryOne("SELECT snapshot_payload,snapshot_hash FROM pdm_work_review_requests WHERE id=:id",{id:submission.data.requestId})).toEqual(row);
    await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"review-package-canonical-file.json"),JSON.stringify({requestId:submission.data.requestId,asset,file,
      sourceHash:asset!.content_hash,size:bytes.length,audit,denials,replaced,packageHash:row!.snapshot_hash,immutablePackageUnchanged:true}));
  });
  it.each(["normal", "read-fault", "enqueue-fault"] as const)("no-job canonical preview %s has actual enqueue readback or safe500 without false202",async variant=>{
    const fixture = await normalDrawingFile("no-job-"+variant);
    await fixtureMutation("F01 exact uploaded queue removal for no-job route input", "DELETE FROM preview_jobs WHERE source_file_asset_id=:id",{id:fixture.assetId});
    const before=await ownedLifecycleSnapshot(); let response:Response, reached=0, completed=0;
    if(variant==="read-fault") response=await withNativeReadFault(sql=>sql.includes("FROM preview_jobs")&&sql.includes("source_content_hash=:sourceContentHash"),
      new Error("DEV122_NO_JOB_READ_FAULT"),()=>fileResponse(fixture,true));
    else if(variant==="enqueue-fault") {
      const original=db!.execute.bind(db!),spy=vi.spyOn(db!,"execute").mockImplementation(async(sql,params)=>{
        const result=await original(sql,params); if(sql.includes("INSERT INTO preview_jobs")){reached++;completed++;throw new Error("DEV122_NO_JOB_ENQUEUE_FAULT");} return result;
      });
      try {response=await fileResponse(fixture,true);}finally{spy.mockRestore();expect(reached).toBe(1);expect(completed).toBe(1);}
    }else response=await fileResponse(fixture,true);
    const body=await response.json(), jobs=await db!.query("SELECT * FROM preview_jobs WHERE source_file_asset_id=:id",{id:fixture.assetId});
    if(variant==="normal"){expect(response.status).toBe(202);expect(jobs).toHaveLength(1);expect(jobs[0]).toMatchObject({status:"queued",attempt_count:0,source_content_hash:fixture.asset.content_hash});}
    else {expect(response.status).toBe(500);expect(body).toMatchObject({error:{code:"WORKBENCH_INTERNAL_ERROR",message:"操作失敗，請稍後再試"}});
      expect(response.headers.get("cache-control")).toBe("private, no-store");expect(JSON.stringify(body)).not.toMatch(/NO_JOB|SELECT|stack/u);
      if(variant==="read-fault"){expect(jobs).toHaveLength(0);expect(await ownedLifecycleSnapshot()).toEqual(before);}else expect(jobs).toHaveLength(1);
    }
    await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"no-job-"+variant+".json"),JSON.stringify({variant,status:response.status,body,reached,completed,jobs,
      callbackBoundary:variant==="enqueue-fault"?"AFTER_ACTUAL_AUTOCOMMIT_INSERT_NOT_A_ROLLBACK_CLAIM":null}));
  });
  it.each(["heartbeat", "claim"] as const)("canonical recovery races actual %s with native timestamp CAS and cannot overwrite fresh actor",async variant=>{
    const fixture=await normalDrawingFile("route-race-"+variant);await resetFileJob(fixture,"queued",0);
    const token=Buffer.alloc(32,125).toString("base64url"),previous=process.env.PDM_WORKLOAD_AUTH_CREDENTIALS,worker="dev122-route-race-"+variant;
    process.env.PDM_WORKLOAD_AUTH_CREDENTIALS=JSON.stringify({schemaVersion:"ai-pdm.workload-credentials.v1",workloads:[{id:worker,token,purposes:["preview_jobs"],capabilities:["solidworks_2d_preview_png"]}]});
    const workload=(url:string,body:object)=>new Request("https://ai-pdm.test"+url,{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify(body)});
    const claim=()=>claimWorkerJob(workload("/api/preview-jobs/claim",{supportedKinds:["native_thumbnail_png"],supportedExtensions:["slddrw"]}));
    let restoreObserver:(()=>void)|undefined,selected=0,casRows:number[]=[];let fresh:Record<string,unknown>|undefined;
    try{
      const claimed=await ok<{job:{jobId:string}}>(await claim());const jobId=String((await currentFileJob(fixture)).id);expect(claimed.job.jobId).toBe(jobId);
      const stale=await resetFileJob(fixture,"running",1,30_001),original=db!.query.bind(db!);let armed=true;
      const observer=vi.spyOn(db!,"query").mockImplementation(async<Row>(sql:string,params?:AsyncDatabaseQueryParams):Promise<Row[]>=>{
        const rows=await original<Row>(sql,params);
        if(armed&&sql.includes("CAST(job.updated_at AS TEXT) AS previous_updated_at")){
          armed=false;selected++;expect(rows.some(row=>(row as {id:string}).id===jobId)).toBe(true);
          if(variant==="heartbeat") await ok(await heartbeatWorkerJob(workload("/api/preview-jobs/"+jobId+"/heartbeat",{}),{params:Promise.resolve({jobId})}));
          else expect((await ok<{job:{jobId:string}}>(await claim())).job.jobId).toBe(jobId);
          fresh=await currentFileJob(fixture);expect(fresh.exact_updated_at).not.toBe(stale.exact_updated_at);
        } else if(sql.includes("previousUpdatedAt")&&sql.includes("RETURNING job.id")) casRows.push(rows.length);
        return rows;
      });
      restoreObserver=()=>observer.mockRestore();
      const response=await fileResponse(fixture,true),body=await response.json();restoreObserver();restoreObserver=undefined;
      expect(response.status).toBe(202);expect(selected).toBe(1);expect(casRows).toContain(0);
      expect(await currentFileJob(fixture)).toEqual(fresh);expect(fresh).toMatchObject({status:"running",locked_by:worker,attempt_count:variant==="heartbeat"?1:2});
      await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"canonical-route-race-"+variant+".json"),JSON.stringify({variant,jobId,stale,fresh,selected,casRows,status:response.status,body,layer:"ACTUAL_SIGNED_CANONICAL_GET_AND_ACTUAL_WORKLOAD_ROUTE"}));
    }finally{restoreObserver?.();if(previous===undefined)delete process.env.PDM_WORKLOAD_AUTH_CREDENTIALS;else process.env.PDM_WORKLOAD_AUTH_CREDENTIALS=previous;}
  });
  it("recognition real-source signed session and workload protocol preserve filename output with isolated broker boundary", async () => {
    const flags={PDM_DRAWING_RECOGNITION_V1:"true",PDM_UNIFIED_DRAWING_WORKBENCH_V1:"true",PDM_NUMBER_LIFECYCLE_V2:"true",
      PDM_ALLOW_WORKER_ENV_SECRET_FALLBACK:"false"};
    const previous=Object.fromEntries(Object.keys(flags).map(name=>[name,process.env[name]]));
    const previousCredentials=process.env.PDM_WORKLOAD_AUTH_CREDENTIALS;
    const licenseNames=["PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY","PDM_SW_DOCUMENT_MANAGER_LICENSE_KEY","SOLIDWORKS_DOCUMENT_MANAGER_KEY"];
    expect(licenseNames.map(name=>({name,present:Boolean(process.env[name])}))).toEqual(licenseNames.map(name=>({name,present:false})));
    const active=await db!.queryOne<{count:string|number}>("SELECT COUNT(*) AS count FROM secret_references WHERE kind='solidworks_document_manager' AND lifecycle_status='active'");
    expect(Number(active!.count)).toBe(0);
    Object.assign(process.env,flags);
    const workerId="dev122-recognition-protocol",token=Buffer.alloc(32,124).toString("base64url");
    process.env.PDM_WORKLOAD_AUTH_CREDENTIALS=JSON.stringify({schemaVersion:"ai-pdm.workload-credentials.v1",workloads:[{id:workerId,token,
      purposes:["recognition_jobs","recognition_heartbeat","settings_secret_probe","solidworks_credential"],capabilities:["solidworks_document_manager"]}]});
    const workload=(url:string,body?:object)=>new Request("https://ai-pdm.test"+url,{method:body?"POST":"GET",headers:{authorization:"Bearer "+token,
      "x-pdm-worker-id":workerId,"content-type":"application/json"},body:body?JSON.stringify(body):undefined});
    const input=realCadInputs.find(row=>row.extension==="SLDDRW")!,canonical=path.resolve("C:/VIBE CODING/AI_PDM"),originalPath=path.resolve(canonical,input.relative);
    expect(originalPath.startsWith(canonical+path.sep)).toBe(true);const original=await fs.readFile(originalPath);
    expect(original.length).toBe(input.bytes);expect(createHash("sha256").update(original).digest("hex")).toBe(input.hash);
    try {
      const fixture=await normalDrawingFile("recognition-original-native",input.extension,original);
      const basis=await db!.queryOne<{revision_id:string}>("SELECT revision_id FROM canonical_workbench_states WHERE work_id=:id AND company_id='company-jenfu'",{id:fixture.workId});
      const created=await ok<{session:{id:string;sourceSetFingerprint:string}}>(await createRecognition(request("/api/numbering/recognition-sessions",ownerToken,"POST",
        {sourceContextType:"drawing_revision",sourceContextId:basis!.revision_id,sourceAssetIds:[fixture.assetId]},1,"","recognition-normal-session")),201);
      const broker=await readDocumentManagerCredential(workload("/api/preview-workers/solidworks-document-manager-key"));
      expect(broker.status).toBe(404);const brokerBody=await broker.json();expect(brokerBody).toEqual({error:"DOCUMENT_MANAGER_LICENSE_KEY_NOT_AVAILABLE"});
      expect(broker.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate");
      const queued=await db!.queryOne<{status:string;not_before:Date|string;now:Date|string}>(
        "SELECT status,not_before,CURRENT_TIMESTAMP AS now FROM drawing_recognition_sessions WHERE id=:id",{id:created.session.id});
      expect(queued!.status).toBe("queued");
      const instant=(value:Date|string)=>value instanceof Date?value.getTime():Date.parse(value);
      const remaining=instant(queued!.not_before)-instant(queued!.now);expect(remaining).toBeLessThanOrEqual(2000);
      await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"recognition-before-claim-readback.json"),JSON.stringify({
        created:created.session,queued,remaining,broker:{status:broker.status,body:brokerBody,cacheControl:broker.headers.get("cache-control")},
        activeOwnRefs:Number(active!.count),input:{hash:input.hash,size:input.bytes},flags}));
      if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining+10));
      const job=await ok<DrawingRecognitionWorkerJob>(await claimRecognition(workload("/api/recognition-jobs/claim",{workerId,maxAttempts:2,allowNativeSources:true})));
      expect(job.sessionId).toBe(created.session.id);expect(job.companyId).toBe("company-jenfu");expect(job.sourceSetFingerprint).toBe(created.session.sourceSetFingerprint);
      expect(job.sources).toHaveLength(1);expect(job.sources[0]).toMatchObject({fileAssetId:fixture.assetId,contentHash:input.hash,fileSize:input.bytes});
      const params={params:Promise.resolve({sessionId:job.sessionId})};
      await ok(await heartbeatRecognition(workload("/api/recognition-jobs/"+job.sessionId+"/heartbeat",{workerId}),params));
      const source=job.sources[0],content=await readRecognitionContent(workload("/api/recognition-jobs/"+job.sessionId+"/sources/"+source.id+"/content"),
        {params:Promise.resolve({sessionId:job.sessionId,sourceId:source.id})});
      expect(content.status,content.status===200?"":await content.clone().text()).toBe(200);expect(content.headers.get("cache-control")).toBe("private, no-store");
      expect(content.headers.get("content-hash")).toBe(input.hash);const bytes=Buffer.from(await content.arrayBuffer());expect(bytes).toEqual(original);
      const filename=buildFilenameAdapterResult(source);expect(filename.status).toBe("succeeded");expect(filename.observations!.map(row=>row.locationKind)).toEqual(["filename","file_role"]);
      const unsupported=buildUnsupportedAdapterResult(source.id,"native-metadata-bridge.v1","native_metadata_license_missing");
      const complete=await ok<Record<string,unknown>>(await completeRecognition(workload("/api/recognition-jobs/"+job.sessionId+"/complete",{
        workerId,sourceSetFingerprint:job.sourceSetFingerprint,results:[filename,unsupported]}),params));
      const session=await db!.queryOne("SELECT id,status,attempt_count,locked_by,initiator_principal_id,source_set_fingerprint FROM drawing_recognition_sessions WHERE id=:id",{id:job.sessionId});
      expect(session).toMatchObject({status:"extraction_partial",attempt_count:1,locked_by:null,initiator_principal_id:"dev122-principal-owner",source_set_fingerprint:job.sourceSetFingerprint});
      const adapters=await db!.query("SELECT adapter_code,status,observation_count,diagnostics_json FROM drawing_recognition_adapter_results WHERE session_id=:id ORDER BY adapter_code",{id:job.sessionId});
      expect(adapters).toHaveLength(2);
      const observations=await db!.query("SELECT location_kind,raw_text FROM drawing_recognition_observations WHERE session_id=:id ORDER BY location_kind",{id:job.sessionId});
      expect(observations).toHaveLength(2);
      await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"recognition-route-protocol-readback.json"),JSON.stringify({
        layer:"ACTUAL_SIGNED_ROUTE_DRIVER_AND_ORIGINAL_FILENAME_ADAPTER",originalWorkerCLI:"NOT_RUN",producerBoundary:"FIXTURE",flags,
        credentialBoundary:{activeOwnRefs:Number(active!.count),licenseEnvironmentPresent:false,fallback:false,status:broker.status,body:brokerBody,cacheControl:broker.headers.get("cache-control")},
        input:{path:originalPath,size:input.bytes,hash:input.hash},workId:fixture.workId,sourceAssetId:fixture.assetId,basis,created:created.session,job,
        content:{status:content.status,size:bytes.length,hash:createHash("sha256").update(bytes).digest("hex"),mime:content.headers.get("content-type")},filename,
        unsupported:{...unsupported,boundary:"EXPLICIT_PROTOCOL_INPUT_NOT_NATIVE_EXTRACTOR_OUTPUT"},complete,session,adapters,observations,
        nativeMetadataSuccessfulExtraction:"BLOCKED_ISOLATED_NO_ACTIVE_BROKER_KEY"}));
    } finally {
      expect(createHash("sha256").update(await fs.readFile(originalPath)).digest("hex")).toBe(input.hash);
      for(const name of Object.keys(flags)){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}
      if(previousCredentials===undefined)delete process.env.PDM_WORKLOAD_AUTH_CREDENTIALS;else process.env.PDM_WORKLOAD_AUTH_CREDENTIALS=previousCredentials;
    }
  });
  it("Part attachment normal signed upload and repeated listing preserve canonical image bytes and storage audit", async () => {
    const created = await ok<{ partNumber: { id: string; partNumber: string } }>(await createRecord(request("/api/numbering/records", ownerToken, "POST",
      { coreName: "DEV122 Part attachment", itemKind: "purchased", structureType: "single_part", drawingRequested: false }, 1, "", "part-attachment-number")), 201);
    const { id: partId, partNumber } = created.partNumber, params = { params: Promise.resolve({ partNumber }) };
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSf8AAAAASUVORK5CYII=", "base64"), form = new FormData();
    form.set("file", new File([new Uint8Array(bytes)], "actual-part-attachment.png", { type: "image/png" })); form.set("document_category", "other");
    const uploaded = await ok<{ attachment: { id: string; entityId: string; contentHash: string } }>(await uploadPartAttachment(new Request(
      "https://ai-pdm.test/api/parts/" + encodeURIComponent(partNumber) + "/attachments", { method: "POST", headers: { cookie: "__session=" + ownerToken,
        "idempotency-key": "part-attachment-upload" }, body: form }), params), 201);
    const assetId = uploaded.attachment.id, hash = createHash("sha256").update(bytes).digest("hex");
    expect(uploaded.attachment).toMatchObject({ entityId: partId, contentHash: hash });
    for (let count = 0; count < 2; count += 1) {
      const listed = await ok<{ attachments: Array<{ id: string; contentHash: string }> }>(await listPartAttachments(request("/api/parts/" + encodeURIComponent(partNumber) + "/attachments"), params));
      expect(listed.attachments.find(row => row.id === assetId)).toMatchObject({ contentHash: hash });
    }
    const url = "/api/pdm/file-assets/" + assetId + "?context=part_attachment&contextId=" + partId + "&bindingId=" + assetId;
    const reads = [];
    for (const preview of [false, true]) {
      const response = await readCanonicalFile(request(url + (preview ? "&preview=1" : "")), { params: Promise.resolve({ fileAssetId: assetId }) });
      const actual = Buffer.from(await response.arrayBuffer());
      reads.push({ preview, status: response.status, mimeType: response.headers.get("content-type"), cacheControl: response.headers.get("cache-control"), bytes: actual.length, hash: createHash("sha256").update(actual).digest("hex") });
      expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("content-type")).toBe("image/png"); expect(actual).toEqual(bytes);
    }
    const audit = await db!.query<{ detail_json: Record<string, unknown> }>("SELECT detail_json FROM audit_logs WHERE action='StorageAccessed' AND detail_json->>'fileId'=:id ORDER BY created_at,id", { id: assetId });
    expect(audit).toHaveLength(2);
    for (const row of audit) expect(row.detail_json).toMatchObject({ securityPrincipalId: "dev122-principal-owner", bytes: bytes.length,
      provider: "local_repository", resourceContext: { context: "part_attachment", contextId: partId, bindingId: assetId } });
    const storage = await db!.queryOne("SELECT content_hash,storage_generation,storage_provider,linked_entity_id FROM file_assets WHERE id=:id", { id: assetId });
    await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "part-attachment-canonical-readback.json"), JSON.stringify({ partId, partNumber, uploaded: uploaded.attachment,
      reads, audit, storage, layer: "ACTUAL_SIGNED_MOUNTED_CALLER_ROUTES", actualDOM: "NOT_RUN", actualCADOutput: "NOT_APPLICABLE_IMAGE_ATTACHMENT" }));
  });
  it.each(["company", "kind", "extension", "source_hash"] as const)("worker claim excludes native %s source input without effects", async variant => {
    const fixture = await normalDrawingFile("claim-negative-" + variant); await resetFileJob(fixture, "queued", 0);
    const job = await currentFileJob(fixture), edits = {
      company: "UPDATE preview_jobs SET company_id='company-dev122-other' WHERE id=:id",
      kind: "UPDATE preview_jobs SET requested_kind='drawing_pdf' WHERE id=:id",
      extension: "UPDATE preview_jobs SET source_extension='step' WHERE id=:id",
      source_hash: "UPDATE file_assets SET content_hash=:hash WHERE id=:id"
    };
    await fixtureMutation("F01 native claim source eligibility negative input", edits[variant], { id: variant === "source_hash" ? fixture.assetId : job.id, hash: "f".repeat(64) });
    const token = Buffer.alloc(32, 112).toString("base64url"), previous = process.env.PDM_WORKLOAD_AUTH_CREDENTIALS;
    process.env.PDM_WORKLOAD_AUTH_CREDENTIALS = JSON.stringify({ schemaVersion: "ai-pdm.workload-credentials.v1", workloads: [
      { id: "dev122-negative-claim-worker", token, purposes: ["preview_jobs"], capabilities: ["solidworks_2d_preview_png"] } ] });
    try {
      const before = await ownedLifecycleSnapshot(), response = await claimWorkerJob(new Request("https://ai-pdm.test/api/preview-jobs/claim", { method: "POST",
        headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify({ supportedKinds: ["native_thumbnail_png"], supportedExtensions: ["slddrw"] }) }));
      const body = await response.json(), after = await ownedLifecycleSnapshot();
      await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "worker-negative-readbacks.jsonl"), JSON.stringify({ variant, phase: "claim", sourceAsset: fixture.assetId,
        jobBefore: await currentFileJob(fixture), status: response.status, body, allOwnedRowsUnchanged: JSON.stringify(after) === JSON.stringify(before) }) + "\n");
      expect(response.status).toBe(200); expect(body).toEqual({ job: null }); expect(after).toEqual(before);
    } finally { if (previous === undefined) delete process.env.PDM_WORKLOAD_AUTH_CREDENTIALS; else process.env.PDM_WORKLOAD_AUTH_CREDENTIALS = previous; }
  });
  it.each(["holder", "provenance"] as const)("claimed content rejects native %s mismatch without storage or DB effects", async variant => {
    const fixture = await normalDrawingFile("content-negative-" + variant); await resetFileJob(fixture, "queued", 0);
    const token = Buffer.alloc(32, 113).toString("base64url"), other = Buffer.alloc(32, 114).toString("base64url"), previous = process.env.PDM_WORKLOAD_AUTH_CREDENTIALS;
    process.env.PDM_WORKLOAD_AUTH_CREDENTIALS = JSON.stringify({ schemaVersion: "ai-pdm.workload-credentials.v1", workloads: [
      { id: "dev122-content-holder", token, purposes: ["preview_jobs"], capabilities: ["solidworks_2d_preview_png"] },
      { id: "dev122-content-nonholder", token: other, purposes: ["preview_jobs"], capabilities: ["solidworks_2d_preview_png"] } ] });
    try {
      const claimed = await ok<{ job: { jobId: string } }>(await claimWorkerJob(new Request("https://ai-pdm.test/api/preview-jobs/claim", { method: "POST",
        headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify({ supportedKinds: ["native_thumbnail_png"], supportedExtensions: ["slddrw"] }) })));
      expect(claimed.job?.jobId).toBe((await currentFileJob(fixture)).id);
      if (variant === "provenance") await fixtureMutation("F01 loss of normal-upload Principal provenance negative input", "UPDATE preview_jobs SET metadata_json='{}' WHERE id=:id", { id: claimed.job.jobId });
      const before = await ownedLifecycleSnapshot(), response = await readWorkerContent(new Request("https://ai-pdm.test/api/preview-jobs/" + claimed.job.jobId + "/content",
        { headers: { authorization: "Bearer " + (variant === "holder" ? other : token) } }), { params: Promise.resolve({ jobId: claimed.job.jobId }) }), body = await response.json(), after = await ownedLifecycleSnapshot();
      await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "worker-negative-readbacks.jsonl"), JSON.stringify({ variant, phase: "content", jobId: claimed.job.jobId,
        status: response.status, body, allOwnedRowsUnchanged: JSON.stringify(after) === JSON.stringify(before) }) + "\n");
      expect(response.status).toBe(403); expect(body).toEqual({ error: "PREVIEW_SOURCE_CLAIM_FORBIDDEN" }); expect(after).toEqual(before);
    } finally { if (previous === undefined) delete process.env.PDM_WORKLOAD_AUTH_CREDENTIALS; else process.env.PDM_WORKLOAD_AUTH_CREDENTIALS = previous; }
  });
  it("uploads through the normal signed command and reads exact source bytes with Principal/company/binding audit", async () => {
    const fixture = await normalDrawingFile("signed-bytes");
    const response = await fileResponse(fixture);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(fixture.bytes);
    const audit = await db!.queryOne<{ detail_json: Record<string, unknown>; company_id: string }>(`SELECT detail_json,company_id FROM audit_logs
      WHERE action='StorageAccessed' AND detail_json->>'fileId'=:id ORDER BY created_at DESC LIMIT 1`, { id: fixture.assetId });
    expect(audit).toMatchObject({ company_id: "company-jenfu", detail_json: { securityPrincipalId: "dev122-principal-owner",
      historicalProfileId: "dev122-profile-owner", bytes: fixture.bytes.length, accessKind: "canonical_file", provider: "local_repository",
      resourceContext: { context: "drawing_revision_work", contextId: fixture.workId, bindingId: fixture.bindingId } } });
    expect((await fileResponse(fixture, false, reviewerToken)).status).toBe(404);
    const wrong = { ...fixture, url: fixture.url.replace(fixture.bindingId, "wrong-binding") };
    expect((await fileResponse(wrong)).status).toBe(404);
  });
  it.each(["DWG", "DXF", "STEP"])("preserves unsupported %s on repeated signed GET and keeps original download", async extension => {
    const fixture = await normalDrawingFile("unsupported-" + extension, extension);
    for (let count = 0; count < 2; count += 1) {
      const response = await fileResponse(fixture, true); expect(response.status).toBe(422);
      expect(response.headers.get("x-pdm-preview-state")).toBe("unsupported");
      expect(await response.json()).toMatchObject({ error: { code: "PREVIEW_UNSUPPORTED", retryable: false } });
    }
    expect(await currentFileJob(fixture)).toMatchObject({ status: "skipped", error_code: "unsupported_preview_source" });
    expect(Buffer.from(await (await fileResponse(fixture)).arrayBuffer())).toEqual(fixture.bytes);
  });
  it.each([["failed", "PREVIEW_FAILED"], ["cancelled", "PREVIEW_CANCELLED"], ["succeeded", "PREVIEW_OUTPUT_MISSING"]])(
    "keeps %s terminal on repeated canonical reads without resetting its row", async (status, code) => {
      const fixture = await normalDrawingFile("terminal-" + status);
      const before = await resetFileJob(fixture, status);
      for (let count = 0; count < 2; count += 1) {
        const response = await fileResponse(fixture, true); expect(response.status).toBe(409);
        expect(response.headers.get("x-pdm-preview-state")).toBe("failed"); expect(response.headers.has("retry-after")).toBe(false);
        expect(await response.json()).toMatchObject({ error: { code, retryable: false } });
      }
      expect(await currentFileJob(fixture)).toEqual(before);
      expect(Buffer.from(await (await fileResponse(fixture)).arrayBuffer())).toEqual(fixture.bytes);
    });
  it.each([
    ["running", 29_999, 2, "running", 202], ["running", 30_001, 2, "queued", 202],
    ["running", 30_001, 3, "failed", 409], ["queued", 119_999, 2, "queued", 202], ["queued", 120_001, 2, "failed", 409]
  ] as const)("canonical GET recovers only bounded %s age=%i attempt=%i", async (status, age, attempt, expected, http) => {
    const fixture = await normalDrawingFile("boundary-" + status + age + attempt), other = await normalDrawingFile("other-" + status + age + attempt);
    const clock = Date.now(); await resetFileJob(fixture, status, attempt, age, clock);
    const untouched = await resetFileJob(other, "running", 2, 30_001, clock);
    const time = vi.spyOn(Date, "now").mockReturnValue(clock);
    try {
      const response = await fileResponse(fixture, true); expect(response.status).toBe(http);
      expect(await currentFileJob(fixture)).toMatchObject({ status: expected, attempt_count: attempt });
      expect(await currentFileJob(other)).toEqual(untouched);
      if (http === 202) expect(await response.json()).toMatchObject({ error: { code: "PREVIEW_NOT_READY", retryable: true } });
    } finally { time.mockRestore(); }
  });
  it("returns unknown dependency safe500 and known missing storage503 after real authorization/native reads", async () => {
    const fixture = await normalDrawingFile("dependency-errors");
    const queryFault = await withNativeReadFault(sql => sql.includes("FROM file_derivatives") && sql.includes(":allowFake"),
      new Error("DEV122_NATIVE_RESOLVER_PRIVATE"), () => fileResponse(fixture, true));
    expect(queryFault.status).toBe(500); expect(await queryFault.json()).toMatchObject({ error: { code: "WORKBENCH_INTERNAL_ERROR" } });
    const original = LocalRepositoryStorageAdapter.prototype.readObject;
    let storageReadReached = 0, storageReadCompleted = 0;
    const storageFault = vi.spyOn(LocalRepositoryStorageAdapter.prototype, "readObject").mockImplementationOnce(async function (this: LocalRepositoryStorageAdapter, key) {
      storageReadReached += 1;
      await original.call(this, key); storageReadCompleted += 1;
      throw new Error("DEV122_PRIVATE_STORAGE_CALLBACK");
    });
    try {
      const response = await fileResponse(fixture); expect(response.status).toBe(500);
      const body = await response.json(); expect(body).toMatchObject({ error: { code: "WORKBENCH_INTERNAL_ERROR" } });
      expect(JSON.stringify(body)).not.toMatch(/PRIVATE_STORAGE|SELECT|stack/u);
    } finally {
      const calls = storageFault.mock.calls.length; storageFault.mockRestore();
      expect(calls).toBeGreaterThan(0); expect(storageReadReached).toBe(1); expect(storageReadCompleted).toBe(1);
    }
    const sourcePath = path.resolve(fixture.asset.original_path), savedPath = sourcePath + ".dev122-missing";
    expect(sourcePath.startsWith(path.resolve(process.env.PDM_REPOSITORY_DIR!) + path.sep)).toBe(true);
    await fs.rename(sourcePath, savedPath);
    try {
      const response = await fileResponse(fixture); expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: { code: "PDM_FILE_UNAVAILABLE", retryable: false } });
    } finally { await fs.rename(savedPath, sourcePath); }
  });
  it.each(realCadInputs)("normal upload $extension -> actual workload content -> fresh registered Shell -> complete -> Principal PNG download", async input => {
    const canonical = path.resolve("C:/VIBE CODING/AI_PDM"), originalPath = path.resolve(canonical, input.relative);
    expect(originalPath.startsWith(canonical + path.sep)).toBe(true);
    const original = await fs.readFile(originalPath); expect(original.length).toBe(input.bytes);
    expect(createHash("sha256").update(original).digest("hex")).toBe(input.hash);
    const previousCredentials = process.env.PDM_WORKLOAD_AUTH_CREDENTIALS;
    const token = Buffer.alloc(32, 123).toString("base64url"), workerId = "dev122-fresh-shell-" + input.extension.toLowerCase();
    process.env.PDM_WORKLOAD_AUTH_CREDENTIALS = JSON.stringify({ schemaVersion: "ai-pdm.workload-credentials.v1", workloads: [
      { id: workerId, token, purposes: ["preview_jobs"], capabilities: ["solidworks_2d_preview_png", "solidworks_3d_preview_png"] } ] });
    const workload = (url: string, body?: object) => new Request("https://ai-pdm.test" + url, { method: body ? "POST" : "GET",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    try {
      const fixture = await normalDrawingFile("fresh-cad-" + input.extension, input.extension, original);
      await fixtureMutation("F01F deterministic queue input priority only; uploaded job metadata retained", "UPDATE preview_jobs SET priority=-1000001 WHERE source_file_asset_id=:id", { id: fixture.assetId });
      const queued = await currentFileJob(fixture);
      expect(queued).toMatchObject({ status: "queued", source_content_hash: input.hash, source_extension: input.extension.toLowerCase(), requested_kind: "native_thumbnail_png" });
      const claimed = await ok<{ job: { jobId: string; generatorProfile: string } }>(await claimWorkerJob(workload("/api/preview-jobs/claim",
        { supportedKinds: ["native_thumbnail_png"], supportedExtensions: [input.extension.toLowerCase()] })));
      expect(claimed.job?.jobId).toBe(queued.id);
      const jobId = claimed.job.jobId, params = { params: Promise.resolve({ jobId }) }, running = await currentFileJob(fixture);
      expect(running).toMatchObject({ status: "running", attempt_count: 1, locked_by: workerId, source_content_hash: input.hash });
      const content = await readWorkerContent(workload("/api/preview-jobs/" + jobId + "/content"), params);
      expect(content.status, await content.clone().text()).toBe(200);
      const actualContent = Buffer.from(await content.arrayBuffer()); expect(actualContent).toEqual(original);
      const png = await extractFreshCadSource(input.extension, actualContent);
      const completed = await ok<{ accepted: boolean; derivativeIds: string[] }>(await completeWorkerJob(workload("/api/preview-jobs/" + jobId + "/complete", {
        status: "succeeded", sourceContentHash: input.hash, derivatives: [{ kind: "thumbnail_png", fileName: "fresh-shell.png", mimeType: "image/png",
          contentBase64: png.toString("base64"), width: png.readUInt32BE(16), height: png.readUInt32BE(20),
          generatorProfile: claimed.job.generatorProfile, generatorVersion: "windows-shell-ishellitemimagefactory-v2" }] }), params));
      expect(completed.accepted).toBe(true); expect(completed.derivativeIds).toHaveLength(1);
      expect((await currentFileJob(fixture)).status).toBe("succeeded");
      const preview = await fileResponse(fixture, true); expect(preview.status).toBe(200); expect(preview.headers.get("content-type")).toBe("image/png");
      const downloaded = Buffer.from(await preview.arrayBuffer()); expect(downloaded).toEqual(png);
      const sourceDownload = await fileResponse(fixture); expect(sourceDownload.status).toBe(200); expect(Buffer.from(await sourceDownload.arrayBuffer())).toEqual(original);
      await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "worker-output-boundaries.jsonl"), JSON.stringify({
        case: "F-01F fresh CAD", layer: "ACTUAL_SIGNED_ROUTE_DRIVER_AND_FRESH_SHELL_EXTRACTION", integratedDaemon: "NOT_RUN",
        input: { path: originalPath, hash: input.hash, bytes: original.length, extension: input.extension }, sourceAsset: fixture.assetId,
        sourceJob: jobId, queued, running, finalJob: await currentFileJob(fixture), actualOutputHash: createHash("sha256").update(downloaded).digest("hex"),
        outputBytes: downloaded.length, mimeType: preview.headers.get("content-type"), producerBoundary: "FIXTURE_PRINCIPAL_WITH_REAL_SHELL_OUTPUT" }) + "\n");
    } finally {
      if (previousCredentials === undefined) delete process.env.PDM_WORKLOAD_AUTH_CREDENTIALS; else process.env.PDM_WORKLOAD_AUTH_CREDENTIALS = previousCredentials;
      expect(createHash("sha256").update(await fs.readFile(originalPath)).digest("hex")).toBe(input.hash);
    }
  }, 90_000);
  it("claims once under actual workload authentication, heartbeats and reads source bytes, then completes protocol-only PNG", async () => {
    const fixture = await normalDrawingFile("worker-protocol"); await resetFileJob(fixture, "queued", 0);
    await fixtureMutation("F01 deterministic lawful queue priority for concurrent target claim", "UPDATE preview_jobs SET priority=-1000000 WHERE source_file_asset_id=:id", { id: fixture.assetId });
    const token = Buffer.alloc(32, 122).toString("base64url"), previousCredentials = process.env.PDM_WORKLOAD_AUTH_CREDENTIALS;
    process.env.PDM_WORKLOAD_AUTH_CREDENTIALS = JSON.stringify({ schemaVersion: "ai-pdm.workload-credentials.v1", workloads: [
      { id: "dev122-protocol-worker", token, purposes: ["preview_jobs"], capabilities: ["solidworks_2d_preview_png"] } ] });
    function workload(url: string, body?: object) { return new Request("https://ai-pdm.test" + url, { method: body ? "POST" : "GET",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); }
    try {
      const input = { supportedKinds: ["native_thumbnail_png"], supportedExtensions: ["slddrw"] };
      const claims = await Promise.all([claimWorkerJob(workload("/api/preview-jobs/claim", input)), claimWorkerJob(workload("/api/preview-jobs/claim", input))]);
      const jobs = await Promise.all(claims.map(response => ok<{ job: null | { jobId: string } }>(response)));
      const current = await currentFileJob(fixture), jobId = String(current.id), params = { params: Promise.resolve({ jobId }) };
      expect(jobs.filter(result => result.job?.jobId === jobId)).toHaveLength(1);
      expect(new Set(jobs.filter(result => result.job).map(result => result.job!.jobId)).size).toBe(jobs.filter(result => result.job).length);
      expect(current).toMatchObject({ status: "running", attempt_count: 1, locked_by: "dev122-protocol-worker" });
      expect(current).toMatchObject({ company_id: "company-jenfu", source_file_asset_id: fixture.assetId, source_content_hash: fixture.asset.content_hash,
        requested_kind: "native_thumbnail_png", source_extension: "slddrw" });
      expect(JSON.parse(String(current.metadata_json))).toMatchObject({ initiator: { kind: "verified_principal", principalId: "dev122-principal-owner" } });
      await ok(await heartbeatWorkerJob(workload("/api/preview-jobs/" + jobId + "/heartbeat", {}), params));
      const source = await readWorkerContent(workload("/api/preview-jobs/" + jobId + "/content"), params);
      const sourceBody = source.status === 200 ? null : await source.clone().json();
      await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "worker-source-readback.json"), JSON.stringify({
        job: await currentFileJob(fixture), actualRoute: { status: source.status, body: sourceBody }, expectedHash: fixture.asset.content_hash }));
      expect(source.status, JSON.stringify(sourceBody)).toBe(200); expect(Buffer.from(await source.arrayBuffer())).toEqual(fixture.bytes);
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSf8AAAAASUVORK5CYII=", "base64");
      const completed = await ok<{ accepted: boolean; derivativeIds: string[] }>(await completeWorkerJob(workload("/api/preview-jobs/" + jobId + "/complete", {
        status: "succeeded", sourceContentHash: fixture.asset.content_hash, derivatives: [{ kind: "thumbnail_png", fileName: "protocol.png", mimeType: "image/png",
          contentBase64: png.toString("base64"), generatorProfile: "dev122_protocol_fixture", generatorVersion: "PROTOCOL_ONLY" }] }), params));
      expect(completed.accepted).toBe(true); expect(completed.derivativeIds).toHaveLength(1);
      const preview = await fileResponse(fixture, true); expect(preview.status).toBe(200); expect(preview.headers.get("content-type")).toBe("image/png");
      expect(Buffer.from(await preview.arrayBuffer())).toEqual(png);
      expect((await completeWorkerJob(workload("/api/preview-jobs/" + jobId + "/complete", { status: "succeeded", sourceContentHash: fixture.asset.content_hash, derivatives: [] }), params)).status).toBe(409);
      await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "worker-output-boundaries.jsonl"), JSON.stringify({
        case: "F-01F protocol subset", sourceAsset: fixture.assetId, sourceHash: fixture.asset.content_hash, jobId,
        outputHash: createHash("sha256").update(png).digest("hex"), producerBoundary: "PROTOCOL_FIXTURE", actualCADOutput: "NOT_RUN" }) + "\n");
    } finally { if (previousCredentials === undefined) delete process.env.PDM_WORKLOAD_AUTH_CREDENTIALS; else process.env.PDM_WORKLOAD_AUTH_CREDENTIALS = previousCredentials; }
  });
});
describe.runIf(lifecycleEnabled)("Signed Principal session + real request guard -> actual part/drawing work and review on native PostgreSQL",()=>{
  it.each(["object", "string"] as const)("reads native matrix JSON-%s work payload through the actual signed route", async variant => {
    const label="native-matrix-"+variant;
    const created=await ok<{partNumber:{id:string}}>(await createRecord(request("/api/numbering/records",ownerToken,"POST",
      {coreName:"DEV122 matrix "+variant,itemKind:"purchased",structureType:"single_part",drawingRequested:false},1,"",label)),201);
    const partId=created.partNumber.id;
    const started=await ok<{data:{workId:string}}>(await createPartWork(request("/api/pdm/parts/"+partId+"/change-works",ownerToken,"POST",{},1,
      await contract("dev122-profile-owner"),label+"-work"),{params:Promise.resolve({partId})}));
    const workId=started.data.workId,work=await ok<Work>(await readPartWork(request("/api/pdm/part-change-works/"+workId),{params:Promise.resolve({workId})}));
    const payload={...work.data.payload,partName:"DEV122 matrix actual "+variant};
    await fixtureMutation("R01 lawful JSONB object/string reader input, preserving native constraints",
      "UPDATE part_change_works SET proposed_payload=CAST(:payload AS jsonb) WHERE id=:id",
      {id:workId,payload:JSON.stringify(variant==="string"?JSON.stringify(payload):payload)});
    const native=await db!.queryOne<{kind:string;proposed_payload:unknown}>(
      "SELECT jsonb_typeof(proposed_payload) AS kind,proposed_payload FROM part_change_works WHERE id=:id",{id:workId});
    expect(native!.kind).toBe(variant);
    const before=await ownedLifecycleSnapshot();
    const response=await readMatrix(request("/api/pdm/parts/"+partId+"/matrix-workspace?workId="+workId),{params:Promise.resolve({partId})});
    const body=await ok<{data:{columns:Array<{workId:string;payload:{partName:string}}>}}>(response);
    expect(body.data.columns.find(column=>column.workId===workId)?.payload.partName).toBe(payload.partName);
    expect(await ownedLifecycleSnapshot()).toEqual(before);
    await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"matrix-native-payload-readbacks.jsonl"),
      JSON.stringify({variant,partId,workId,native,status:response.status,body,readOnlyOwnedRowsUnchanged:true})+"\n");
  });
  it("denies the default rd_manager-only Principal Drawing list without widening its grants",async()=>{
    const before=await ownedLifecycleSnapshot();
    const response=await readDrawingWorkbench(request("/api/numbering/drawings/workbench?limit=100")),body=await response.json();
    expect(response.status).toBe(403);expect(JSON.stringify(body)).toContain("permission_not_granted");
    expect(await ownedLifecycleSnapshot()).toEqual(before);
    await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"default-drawing-page-denial.json"),JSON.stringify({status:response.status,body,
      fixtureRole:"rd_manager",uiMultiRoleFixture:false,cacheControl:response.headers.get("cache-control"),contentType:response.headers.get("content-type")}));
  });
  it("rejects a tampered signature, an unregistered signed session, and a Principal without creation permission", async () => {
    const payload = { coreName: "DEV122 denied creation", itemKind: "purchased", structureType: "single_part", drawingRequested: false };
    const before = await ownedLifecycleSnapshot();
    const pieces = ownerToken.split(".");
    pieces[2] = (pieces[2][0] === "A" ? "B" : "A") + pieces[2].slice(1);
    expect((await createRecord(request("/api/numbering/records", pieces.join("."), "POST", payload))).status).toBe(401);
    const ring = getPlatformSessionKeyRing();
    const ownerClaims = verifyJenfuPrincipalSession(ownerToken, ring);
    const unregistered = issueJenfuPrincipalSession({ ...ownerClaims, sessionId: "dev122-unregistered-session" }, ring);
    expect((await createRecord(request("/api/numbering/records", unregistered, "POST", payload))).status).toBe(401);
    expect((await createRecord(request("/api/numbering/records", deniedToken, "POST", payload))).status).toBe(403);
    expect(await ownedLifecycleSnapshot()).toEqual(before);
  });
  it("creates, edits, submits and approves a part; only the assigned Principal can decide, with exact replay",async()=>{
    const created=await ok<{partNumber:{id:string}}>(await createRecord(request("/api/numbering/records",ownerToken,"POST",
      {coreName:"DEV122 part review",itemKind:"purchased",structureType:"single_part",drawingRequested:false})),201);
    const partId=created.partNumber.id;
    const start=await ok<{data:{workId:string;rowVersion:number}}>(await createPartWork(request("/api/pdm/parts/"+partId+"/change-works",ownerToken,"POST",{},1,
      await contract("dev122-profile-owner")),{params:Promise.resolve({partId})}));
    const workId=start.data.workId,params={params:Promise.resolve({workId})};
    const actor={id:"dev122-profile-owner",companyId:"company-jenfu",canEditNonOwned:false,
      permissions:{create:true,update:true,submit:true,cancel:false,decide:false}};
    const directMatrix=await db!.transaction(tx=>readPartNumberMatrixWorkspace({client:tx,sourcePartId:partId,
      sourceWorkId:workId,actor}),{readOnly:true,isolationLevel:"repeatable_read"});
    expect(directMatrix.data.columns[0]).toMatchObject({partId,workId,canEdit:true});
    await ok(await readMatrix(request("/api/pdm/parts/"+partId+"/matrix-workspace?workId="+workId),
      {params:Promise.resolve({partId})}));

    let work=await ok<Work>(await readPartWork(request("/api/pdm/part-change-works/"+workId),params));
    await ok(await updatePartWork(request("/api/pdm/part-change-works/"+workId,ownerToken,"PATCH",
      {...work.data.payload,partName:"Principal reviewed part"},work.data.rowVersion,work.meta.contractToken),params));
    work=await ok<Work>(await readPartWork(request("/api/pdm/part-change-works/"+workId),params));

    const reloaded=await ok<{data:{columns:Array<{workId:string;payload:{partName:string}}>}}>(await readMatrix(
      request("/api/pdm/parts/"+partId+"/matrix-workspace?workId="+workId),{params:Promise.resolve({partId})}));
    expect(reloaded.data.columns[0]).toMatchObject({workId,payload:{partName:"Principal reviewed part"}});
    await ok(await readMatrix(request("/api/pdm/parts/"+partId+"/matrix-workspace?workId=wrong-work"),
      {params:Promise.resolve({partId})}),404);
    const submission=await ok<Submission>(await submitPart(request("/api/pdm/part-change-works/"+workId+"/submit",ownerToken,"POST",{},
      work.data.rowVersion,work.meta.contractToken),params));
    await completeReview(submission,"approve");
    expect(await db!.queryOne("SELECT part_name,record_status FROM part_numbers WHERE id=:id",{id:partId})).toMatchObject({part_name:"Principal reviewed part",record_status:"Draft"});
    expect(await db!.queryOne("SELECT id FROM part_change_works WHERE id=:id",{id:workId})).toBeNull();
  });
  it("uploads two native drawing files, submits the first revision and returns it for correction without changing its owner",async()=>{
    const created=await ok<{drawingNumber:{id:string}}>(await createRecord(request("/api/numbering/records",ownerToken,"POST",
      {coreName:"DEV122 drawing review",itemKind:"manufactured",structureType:"single_part",drawingRequested:true,drawingPurposeCode:"M"},1,"","drawing-number-one")),201);
    const row=await db!.queryOne<{id:string}>(`SELECT work.id FROM drawing_revision_works work JOIN drawings d ON d.id=work.drawing_id
      WHERE d.formal_drawing_number_id=:id`,{id:created.drawingNumber.id});
    expect(row).toBeTruthy();const workId=row!.id,params={params:Promise.resolve({workId})};
    for(const name of ["synthetic.SLDDRW","synthetic.SLDPRT"]){
      const work=await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/"+workId),params));
      const form=new FormData();form.set("file",new File(["task-owned synthetic "+name],name,{type:"application/octet-stream"}));
      await ok(await uploadDrawingFile(new Request("https://ai-pdm.test/api/pdm/drawing-revision-works/"+workId+"/files",{
        method:"POST",headers:{cookie:"__session="+ownerToken,"if-match":String(work.data.rowVersion),
          "x-pdm-workbench-contract":work.meta.contractToken,"idempotency-key":"upload-"+name},body:form}),params));
    }
    const work=await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/"+workId),params));
    const submission=await ok<Submission>(await submitDrawing(request("/api/pdm/drawing-revision-works/"+workId+"/submit",ownerToken,"POST",{},
      work.data.rowVersion,work.meta.contractToken),params));
    await completeReview(submission,"return_for_correction");
    const refreshed=await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/"+workId),params));
    expect(refreshed.data.workId).toBe(workId);
    expect(await db!.queryOne("SELECT owner_user_id FROM drawing_revision_works WHERE id=:id",{id:workId})).toMatchObject({owner_user_id:"dev122-profile-owner"});
  });
});


async function draftReleaseFixture(label: string) {
  const created = await ok<{partNumber:{id:string;partNumber:string}}>(await createRecord(request("/api/numbering/records", ownerToken, "POST",
    {coreName:"DEV122 lifecycle "+label,itemKind:"purchased",structureType:"single_part",drawingRequested:false},1,"","lifecycle-number-"+label)),201);
  const partId=created.partNumber.id;
  expect(await db!.queryOne("SELECT record_status FROM part_numbers WHERE id=:id",{id:partId})).toMatchObject({record_status:"Draft"});
  expect(await db!.queryOne("SELECT id FROM part_approved_change_snapshots WHERE part_id=:id",{id:partId})).toBeNull();
  const started=await ok<{data:{workId:string}}>(await createPartWork(request("/api/pdm/parts/"+partId+"/change-works",ownerToken,"POST",{},1,
    await contract("dev122-profile-owner")),{params:Promise.resolve({partId})}));
  const workId=started.data.workId,params={params:Promise.resolve({workId})};
  const before=await ok<Work>(await readPartWork(request("/api/pdm/part-change-works/"+workId),params));
  await ok(await updatePartWork(request("/api/pdm/part-change-works/"+workId,ownerToken,"PATCH",
    {...before.data.payload,lifecycleIntent:"first_release"},before.data.rowVersion,before.meta.contractToken),params));
  const work=await ok<Work>(await readPartWork(request("/api/pdm/part-change-works/"+workId),params));
  expect(work.data.payload).toEqual(before.data.payload);
  const matrix=await ok<{data:{columns:Array<Record<string,unknown>>}}>(await readMatrix(
    request("/api/pdm/parts/"+partId+"/matrix-workspace?workId="+workId),{params:Promise.resolve({partId})}));
  expect(matrix.data.columns.find(column=>column.partId===partId)).toMatchObject({lifecycleIntent:"first_release",canSubmit:true,canRequestRelease:true});
  const submission=await ok<Submission>(await submitPart(request("/api/pdm/part-change-works/"+workId+"/submit",ownerToken,"POST",{},
    work.data.rowVersion,work.meta.contractToken),params));
  const frozen = await db!.queryOne<{ snapshot_payload: { decisionBasis: { workRowVersion: number } } }>(
    "SELECT snapshot_payload FROM pdm_work_review_requests WHERE id=:id", { id: submission.data.requestId });
  expect(frozen!.snapshot_payload.decisionBasis.workRowVersion).toBe(work.data.rowVersion);
  const review=await ok<{data:{lifecycle:{intent:string;masterStatus:string}}}>(await readReview(request("/api/pdm/review-requests/"+submission.data.requestId,reviewerToken),
    {params:Promise.resolve({requestId:submission.data.requestId})}));
  expect(review.data.lifecycle).toMatchObject({intent:"first_release",masterStatus:"Draft"});
  return {partId,workId,submission};
}

async function initialDrawingFixture(label: string) {
  const created = await ok<{ drawingNumber: { id: string } }>(await createRecord(request("/api/numbering/records", ownerToken, "POST",
    { coreName: "DEV122 drawing " + label, itemKind: "manufactured", structureType: "single_part", drawingRequested: true, drawingPurposeCode: "M" }, 1, "", label + "-number")), 201);
  const initial = await db!.queryOne<{ id: string; drawing_id: string }>(`SELECT work.id,work.drawing_id FROM drawing_revision_works work JOIN drawings drawing ON drawing.id=work.drawing_id
    WHERE drawing.formal_drawing_number_id=:id`, { id: created.drawingNumber.id });
  expect(initial).toBeTruthy(); await uploadNativeProtocolPair(initial!.id, label + "-initial");
  return { masterId: created.drawingNumber.id, drawingId: initial!.drawing_id, workId: initial!.id };
}
async function nextDrawingWork(drawingId: string, kind: "production" | "rd", label: string, layer = "drawing_rd") {
  const source = await db!.queryOne<{ id: string }>(`SELECT id FROM canonical_workbench_states WHERE canonical_entity_id=:id AND data_layer=:layer AND handling='none' AND work_id IS NULL ORDER BY updated_at DESC LIMIT 1`, { id: drawingId, layer });
  expect(source).toBeTruthy(); const params = { params: Promise.resolve({ drawingId }) };
  const targets = await ok<{ data: { source: { rowVersion: number }; candidates: Array<{ kind: string; enabled: boolean; candidateToken: string | null }> }; meta: { contractToken: string } }>(
    await readDrawingTargets(request(`/api/pdm/drawings/${drawingId}/revision-targets?sourceRowKey=cw_${source!.id}`), params));
  const candidate = targets.data.candidates.find(value => value.kind === kind && value.enabled); expect(candidate?.candidateToken).toBeTruthy();
  const started = await ok<{ data: { workId: string } }>(await createDrawingWork(request(`/api/pdm/drawings/${drawingId}/revision-works`, ownerToken, "POST",
    { sourceRowKey: "cw_" + source!.id, selectionMode: "recommended", candidateToken: candidate!.candidateToken }, targets.data.source.rowVersion, targets.meta.contractToken, label + "-work"), params));
  const workId = started.data.workId; await uploadNativeProtocolPair(workId, label);
  {
    const workParams = { params: Promise.resolve({ workId }) }, work = await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/" + workId), workParams));
    await ok(await updateDrawingWork(request("/api/pdm/drawing-revision-works/" + workId, ownerToken, "PATCH",
      { ...work.data.payload, changeImpact: { ...(work.data.payload.changeImpact as object), formState: "no_impact", fitState: "no_impact", functionState: "no_impact" } },
      work.data.rowVersion, work.meta.contractToken, label + "-fff"), workParams));
  }
  return workId;
}
async function preparedMajorFixture(label: string) {
  const fixture = await initialDrawingFixture(label); await completeReview(await submitNativeDrawing(fixture.workId), "approve");
  return { ...fixture, workId: await nextDrawingWork(fixture.drawingId, "production", label + "-major") };
}
async function nativeDrawingDecision(submission: Submission, label: string, decision = "approve") {
  const id = submission.data.requestId;
  return decideReview(request("/api/pdm/review-requests/" + id + "/decisions", reviewerToken, "POST", { decision },
    submission.data.rowVersion, await contract("dev122-profile-reviewer"), label), { params: Promise.resolve({ requestId: id }) });
}
describe.runIf(lifecycleEnabled)("DEV122 D03/D04 native canonical lifecycle",()=>{
  it("Drawing real samecompany root drift after frozen major package refuses approval with no effects",async()=>{
    const fixture=await preparedMajorFixture("drawing-postsubmit-root"),submission=await submitNativeDrawing(fixture.workId),rootId=crypto.randomUUID();
    await fixtureMutation("G03 lawful empty samecompany Draft root input; no lifecycle outcome",
      "INSERT INTO part_roots(id,company_id,root_code,core_name,item_kind,created_by) VALUES(:id,'company-jenfu','DEV122-DRAWING-ROOT-DRIFT','DEV122 root scope negative input','manufactured','dev122-profile-owner')",{id:rootId});
    await fixtureMutation("G03 existing samecompany FK-valid Drawing root drift after immutable package","UPDATE drawings SET part_root_id=:root WHERE id=:id",{id:fixture.drawingId,root:rootId});
    const before=await ownedLifecycleSnapshot(),response=await nativeDrawingDecision(submission,"drawing-postsubmit-root-approve"),body=await response.json(),after=await ownedLifecycleSnapshot();
    await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"drawing-root-drift-first-response.json"),JSON.stringify({fixture,submission,rootId,status:response.status,body,before,after}));
    expect(response.status).toBe(409);expect(body).toMatchObject({error:{code:"WORKBENCH_SNAPSHOT_DRIFT"}});expect(after).toEqual(before);
  });
  it("Part real samecompany root drift after frozen release package refuses approval with no effects",async()=>{
    const fixture=await draftReleaseFixture("part-root-drift"),other={rootId:crypto.randomUUID()};
    await fixtureMutation("P03 lawful empty samecompany Draft root input avoids unrelated P01 unique collision; no approved result",
      "INSERT INTO part_roots(id,company_id,root_code,core_name,item_kind,created_by) VALUES(:id,'company-jenfu',:code,'DEV122 root scope negative input','purchased','dev122-profile-owner')",
      {id:other.rootId,code:"DEV122-ROOT-DRIFT"});
    const root=await db!.queryOne<{id:string}>("SELECT id FROM part_roots WHERE id=:id AND company_id='company-jenfu'",{id:other.rootId});
    expect(root).toBeTruthy();
    await fixtureMutation("P03 actual existing samecompany root FK-valid Part drift input","UPDATE part_numbers SET part_root_id=:root WHERE id=:id",{id:fixture.partId,root:root!.id});
    const before=await ownedLifecycleSnapshot(),id=fixture.submission.data.requestId;
    const response=await decideReview(request("/api/pdm/review-requests/"+id+"/decisions",reviewerToken,"POST",{decision:"approve"},fixture.submission.data.rowVersion,
      await contract("dev122-profile-reviewer"),"part-root-drift-approve"),{params:Promise.resolve({requestId:id})}),body=await response.json();
    const after=await ownedLifecycleSnapshot();
    await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"part-root-drift-first-response.json"),JSON.stringify({fixture,other,root,status:response.status,body,before,after}));
    expect(response.status).toBe(409);expect(body).toMatchObject({error:{code:"WORKBENCH_SNAPSHOT_DRIFT"}});expect(after).toEqual(before);
  });
  it("Part wrongroot relation link actual signed matrix command rejects without effects",async()=>{
    const fixture=await initialDrawingFixture("wrongroot-link"),other=await draftReleaseFixture("wrongroot-link-part");
    const row=await db!.queryOne<{part_root_id:string}>("SELECT part_root_id FROM drawing_numbers WHERE id=:id",{id:fixture.masterId}),rootId=row!.part_root_id;
    const params={params:Promise.resolve({rootId})},matrix=await ok<{data:{matrixEtag:string};meta:{contractToken:string}}>(await readRelationMatrix(request("/api/pdm/relations/"+rootId+"/matrix"),params));
    const before=await ownedLifecycleSnapshot();
    const response=await updateRelationMatrix(new Request("https://ai-pdm.test/api/pdm/relations/"+rootId+"/matrix",{method:"PATCH",headers:{cookie:"__session="+ownerToken,
      "content-type":"application/json","if-match":matrix.data.matrixEtag,"x-pdm-workbench-contract":matrix.meta.contractToken,"idempotency-key":"wrongroot-link-command"},
      body:JSON.stringify({changes:[{drawingNumberId:fixture.masterId,partNumberId:other.partId,relationType:"reference"}]})}),params),body=await response.json();
    expect(response.status).toBe(422);expect(body).toMatchObject({error:{code:"WORKBENCH_BAD_REQUEST"}});expect(await ownedLifecycleSnapshot()).toEqual(before);
    await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"wrongroot-relation-link.json"),JSON.stringify({fixture,other,rootId,status:response.status,body}));
  });
  it("Drawing nonnull master label mismatch rejects submission without effects",async()=>{
    const fixture=await initialDrawingFixture("nonnull-label-mismatch");
    await fixtureMutation("G03 nonnull samecompany Drawing label mismatch legal negative input","UPDATE drawings SET drawing_number=:label WHERE id=:id",{id:fixture.drawingId,label:"DEV122_DIFFERENT_LABEL"});
    const before=await ownedLifecycleSnapshot(),params={params:Promise.resolve({workId:fixture.workId})};
    const work=await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/"+fixture.workId),params));
    const response=await submitDrawing(request("/api/pdm/drawing-revision-works/"+fixture.workId+"/submit",ownerToken,"POST",{},work.data.rowVersion,work.meta.contractToken,"nonnull-label-submit"),params),body=await response.json();
    expect(response.status).toBe(409);expect(body).toMatchObject({error:{code:"WORKBENCH_SNAPSHOT_DRIFT"}});expect(await ownedLifecycleSnapshot()).toEqual(before);
    await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"nonnull-master-label-mismatch.json"),JSON.stringify({fixture,status:response.status,body}));
  });
  it("Drawing mapping native unique and FK constraints reject ambiguous links with full owned rollback",async()=>{
    const fixture=await initialDrawingFixture("constraint-mapping"),other=await initialDrawingFixture("constraint-mapping-other");
    const master=await db!.queryOne<{drawing_number:string}>("SELECT drawing_number FROM drawing_numbers WHERE id=:id",{id:fixture.masterId});
    const link=await db!.queryOne<{id:string;part_number_id:string}>("SELECT id,part_number_id FROM drawing_part_links WHERE drawing_number_id=:id AND link_type='primary_manufacturing'",{id:fixture.masterId});
    expect(link).toBeTruthy();const before=await ownedLifecycleSnapshot(),failures=[];
    for(const test of [
      {name:"duplicate-master-label",code:"23505",sql:"UPDATE drawing_numbers SET drawing_number=:label WHERE id=:id",params:{id:other.masterId,label:master!.drawing_number}},
      {name:"duplicate-primary-for-part",code:"23505",sql:"INSERT INTO drawing_part_links(id,drawing_number_id,part_number_id,link_type) VALUES(:id,:drawing,:part,'primary_manufacturing')",params:{id:crypto.randomUUID(),drawing:other.masterId,part:link!.part_number_id}},
      {name:"missing-master-foreign-key",code:"23503",sql:"UPDATE drawings SET formal_drawing_number_id=:master WHERE id=:id",params:{id:fixture.drawingId,master:"dev122-nonexistent-master"}}
    ]){
      const failure=await db!.transaction(async tx=>{
        await tx.execute("SAVEPOINT dev122_mapping_constraint");let caught:null|{code?:string;message:string;constraint?:string}=null;
        try{await tx.execute(test.sql,test.params);}catch(error){const native=error as Error&{code?:string;constraint?:string};caught={code:native.code,message:native.message,constraint:native.constraint};}
        finally{await tx.execute("ROLLBACK TO SAVEPOINT dev122_mapping_constraint");await tx.execute("RELEASE SAVEPOINT dev122_mapping_constraint");}
        return caught;
      });
      failures.push({name:test.name,sql:test.sql,params:test.params,failure});expect(failure?.code).toBe(test.code);expect(await ownedLifecycleSnapshot()).toEqual(before);
    }
    await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"mapping-constraint-reachability.json"),JSON.stringify({fixture,other,failures,
      layer:"ACTUAL_NATIVE_CONSTRAINT_REJECTION_NOT_AN_APPLICATION_ROUTE_VARIANT",allOwnedRowsUnchanged:true}));
  });
  it.each(["part", "minor"] as const)("historical v1 %s nonrelease basis remains compatible without inventing frozen counters", async kind => {
    const label = "historical-v1-" + kind;
    let entityId: string, workId: string, masterId: string, originalSubmission: Submission;
    if (kind === "part") {
      const created = await ok<{partNumber:{id:string}}>(await createRecord(request("/api/numbering/records",ownerToken,"POST",
        {coreName:label,itemKind:"purchased",structureType:"single_part",drawingRequested:false},1,"",label+"-create")),201);
      entityId = masterId = created.partNumber.id;
      const started = await ok<{data:{workId:string}}>(await createPartWork(request("/api/pdm/parts/"+entityId+"/change-works",ownerToken,"POST",{},1,
        await contract("dev122-profile-owner"),label+"-work"),{params:Promise.resolve({partId:entityId})}));
      workId = started.data.workId;
      const params = {params:Promise.resolve({workId})}, work = await ok<Work>(await readPartWork(request("/api/pdm/part-change-works/"+workId),params));
      await ok(await updatePartWork(request("/api/pdm/part-change-works/"+workId,ownerToken,"PATCH",
        {...work.data.payload,partName:label+" approved"},work.data.rowVersion,work.meta.contractToken,label+"-edit"),params));
      const saved = await ok<Work>(await readPartWork(request("/api/pdm/part-change-works/"+workId),params));
      originalSubmission = await ok<Submission>(await submitPart(request("/api/pdm/part-change-works/"+workId+"/submit",ownerToken,"POST",{},
        saved.data.rowVersion,saved.meta.contractToken,label+"-submit"),params));
    } else {
      const fixture = await initialDrawingFixture(label);
      entityId = fixture.drawingId; masterId = fixture.masterId; workId = fixture.workId;
      originalSubmission = await submitNativeDrawing(workId,label+"-submit");
    }
    const originalId = originalSubmission.data.requestId;
    const row = await db!.queryOne<{snapshot_payload:ReviewPackageEnvelope;snapshot_hash:string;branch_id:string|null;reviewer_user_id:string;review_cycle_id:string}>(
      "SELECT snapshot_payload,snapshot_hash,branch_id,reviewer_user_id,review_cycle_id FROM pdm_work_review_requests WHERE id=:id",{id:originalId});
    expect(row).toBeTruthy();
    const envelope = structuredClone(row!.snapshot_payload);
    envelope.decisionBasis.version = 1; delete envelope.decisionBasis.lifecycle; delete envelope.decisionBasis.workRowVersion;
    envelope.decisionBasis.hash = kind === "part"
      ? reviewDecisionBasisHash({payload:envelope.decisionBasis.payload})
      : dev087RequestHash({payload:envelope.decisionBasis.payload,revisionId:envelope.decisionBasis.revisionId,claimId:envelope.decisionBasis.claimId});
    const {packageHash:_old,...body} = envelope; envelope.packageHash = reviewPackageHash(body);
    const artifact = path.join(process.env.DEV122_EVIDENCE_ROOT!,label+"-input.json"), immutableBytes = JSON.stringify({original:row,historicalFixtureInput:envelope});
    await fs.writeFile(artifact,immutableBytes);
    await completeReview(originalSubmission,"return_for_correction");
    expect(await db!.queryOne("SELECT request_id FROM pdm_work_review_terminal_receipts WHERE request_id=:id",{id:originalId})).toMatchObject({request_id:originalId});
    const id = crypto.randomUUID(), cycle = crypto.randomUUID();
    await fixtureMutation("Historical v1 nonrelease pending input after actual return; original snapshot bytes retained separately",`INSERT INTO pdm_work_review_requests
      (id,company_id,request_kind,entity_type,canonical_entity_id,work_id,branch_id,reviewer_user_id,review_cycle_id,snapshot_payload,snapshot_hash,request_status,row_version)
      VALUES(:id,'company-jenfu',:kind,:type,:entity,:work,:branch,:reviewer,:cycle,CAST(:payload AS jsonb),:hash,'pending',1)`,
      {id,kind:kind==="part"?"part_change":"drawing_revision",type:kind==="part"?"part":"drawing",entity:entityId,work:workId,
        branch:row!.branch_id,reviewer:row!.reviewer_user_id,cycle,payload:JSON.stringify(envelope),hash:envelope.packageHash});
    await fixtureMutation("Historical v1 pending owner-state prerequisite", "UPDATE canonical_workbench_states SET handling='review_owner',row_version=row_version+1 WHERE company_id='company-jenfu' AND work_id=:id AND handling='owner'",{id:workId});
    if(kind==="minor") await fixtureMutation("Historical v1 minor pending revision prerequisite", "UPDATE drawing_revisions SET lifecycle_state='in_review' WHERE company_id='company-jenfu' AND id=:id AND lifecycle_state='correction_required'",{id:envelope.decisionBasis.revisionId});
    const table = kind==="part"?"part_numbers":"drawing_numbers";
    const masterBefore = await db!.queryOne("SELECT * FROM "+table+" WHERE id=:id",{id:masterId});
    expect(masterBefore).toMatchObject({record_status:"Draft"});
    const productionBefore = await db!.query("SELECT * FROM canonical_workbench_states WHERE canonical_entity_id=:id AND data_layer='drawing_production' ORDER BY id",{id:entityId});
    expect(await db!.queryOne("SELECT snapshot_payload,snapshot_hash FROM pdm_work_review_requests WHERE id=:id",{id})).toEqual({snapshot_payload:envelope,snapshot_hash:envelope.packageHash});
    await completeReview({data:{requestId:id,rowVersion:1}},"approve");
    const masterAfter = await db!.queryOne("SELECT * FROM "+table+" WHERE id=:id",{id:masterId});
    expect(masterAfter).toMatchObject({record_status:"Draft"});
    if(kind==="minor") expect(masterAfter).toEqual(masterBefore);
    else expect(masterAfter).toMatchObject({part_name:label+" approved"});
    expect(await db!.query("SELECT * FROM canonical_workbench_states WHERE canonical_entity_id=:id AND data_layer='drawing_production' ORDER BY id",{id:entityId})).toEqual(productionBefore);
    expect(await fs.readFile(artifact,"utf8")).toBe(immutableBytes);
    await fs.writeFile(artifact+".outcome.json",JSON.stringify({originalId,historicalId:id,kind,masterBefore,masterAfter,productionBefore,
      originalArtifactHash:createHash("sha256").update(immutableBytes).digest("hex"),layer:"ACTUAL_SIGNED_ROUTES_WITH_HISTORICAL_INPUT_FIXTURE",originalProducer:"NOT_CLAIMED"}));
  },15_000);
  it.each(["revision", "claim"] as const)("Drawing actual frozen %s identity drift rejects before effects with unchanged work counter", async variant => {
    const fixture = await preparedMajorFixture("identity-" + variant), submission = await submitNativeDrawing(fixture.workId);
    const original = await new DrawingRevisionWorkAsyncRepository(db!).readWork(db!, "company-jenfu", fixture.workId); expect(original).toBeTruthy();
    if (variant === "revision") {
      const previous = await db!.queryOne<{ id: string }>("SELECT id FROM drawing_revisions WHERE company_id='company-jenfu' AND drawing_id=:id AND lifecycle_state='rd_controlled' ORDER BY created_at,id LIMIT 1", { id: fixture.drawingId });
      expect(previous).toBeTruthy(); expect(previous!.id).not.toBe(original!.revision_id);
      await fixtureMutation("G03 same-Drawing canonical work revision identity negative input", "UPDATE canonical_workbench_states SET revision_id=:revisionId WHERE company_id='company-jenfu' AND work_id=:id", { id: fixture.workId, revisionId: previous!.id });
    } else {
      const claimId = crypto.randomUUID();
      await fixtureMutation("G03 lawful same-company/branch claim identity input; not an approved result", `INSERT INTO drawing_revision_claims
        (id,company_id,drawing_id,branch_id,target_major,target_minor,target_label,predecessor_revision_id,claim_state)
        VALUES(:id,'company-jenfu',:drawingId,:branchId,99,0,'99',:predecessor,'work')`,
        { id: claimId, drawingId: fixture.drawingId, branchId: original!.branch_id, predecessor: original!.predecessor_revision_id });
      await fixtureMutation("G03 work claim identity negative input with native company/branch constraints retained", "UPDATE drawing_revision_works SET target_claim_id=:claimId WHERE id=:id", { id: fixture.workId, claimId });
    }
    expect(await db!.queryOne("SELECT row_version FROM drawing_revision_works WHERE id=:id", { id: fixture.workId })).toMatchObject({ row_version: original!.row_version });
    const currentIdentity = await db!.queryOne("SELECT work.target_claim_id,state.revision_id,work.row_version FROM drawing_revision_works work JOIN canonical_workbench_states state ON state.work_id=work.id AND state.company_id=work.company_id WHERE work.id=:id", { id: fixture.workId });
    expect(currentIdentity).toMatchObject({ row_version: original!.row_version });
    expect(currentIdentity).not.toMatchObject(variant === "revision" ? { revision_id: original!.revision_id } : { target_claim_id: original!.target_claim_id });
    const before = await ownedLifecycleSnapshot(), response = await nativeDrawingDecision(submission, "identity-drift-decision-" + variant), body = await response.json(), after = await ownedLifecycleSnapshot();
    await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "drawing-identity-readbacks.jsonl"), JSON.stringify({ variant, originalWork: original, currentIdentity,
      status: response.status, body, allOwnedRowsUnchanged: JSON.stringify(after) === JSON.stringify(before) }) + "\n");
    expect(response.status).toBe(409); expect(body).toMatchObject({ error: { code: "WORKBENCH_SNAPSHOT_DRIFT" } }); expect(after).toEqual(before);
  });
  it("Drawing malformed root mapping rejects normal submission without effects", async () => {
    const fixture = await initialDrawingFixture("root-mapping"), other = await initialDrawingFixture("other-root-mapping");
    const otherRoot = await db!.queryOne<{ part_root_id: string }>("SELECT part_root_id FROM drawings WHERE id=:id", { id: other.drawingId });
    await fixtureMutation("G03 own existing distinct root negative mapping input", "UPDATE drawings SET part_root_id=:rootId WHERE id=:id", { id: fixture.drawingId, rootId: otherRoot!.part_root_id });
    const params = { params: Promise.resolve({ workId: fixture.workId }) }, work = await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/" + fixture.workId), params));
    const before = await ownedLifecycleSnapshot(), response = await submitDrawing(request("/api/pdm/drawing-revision-works/" + fixture.workId + "/submit", ownerToken, "POST", {}, work.data.rowVersion,
      work.meta.contractToken, "root-mapping-submit"), params), body = await response.json(), after = await ownedLifecycleSnapshot();
    await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "drawing-identity-readbacks.jsonl"), JSON.stringify({ variant: "root", drawingId: fixture.drawingId,
      actualRoot: otherRoot, status: response.status, body, allOwnedRowsUnchanged: JSON.stringify(after) === JSON.stringify(before) }) + "\n");
    expect(response.status).toBe(409); expect(body).toMatchObject({ error: { code: "WORKBENCH_REVIEW_PACKAGE_INVALID" } }); expect(after).toEqual(before);
  });
  it("Drawing cross-company master mapping rejects the non-null mapping rather than treating it as legacy unmapped", async () => {
    const fixture = await initialDrawingFixture("master-company-mapping");
    await fixtureMutation("G03 non-null master company mismatch negative input retaining all native FKs", "UPDATE drawing_numbers SET company_id='company-dev122-other' WHERE id=:id", { id: fixture.masterId });
    const params = { params: Promise.resolve({ workId: fixture.workId }) }, work = await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/" + fixture.workId), params));
    const before = await ownedLifecycleSnapshot(), response = await submitDrawing(request("/api/pdm/drawing-revision-works/" + fixture.workId + "/submit", ownerToken, "POST", {}, work.data.rowVersion,
      work.meta.contractToken, "master-company-mapping-submit"), params), body = await response.json(), after = await ownedLifecycleSnapshot();
    await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "drawing-identity-readbacks.jsonl"), JSON.stringify({ variant: "master-company", masterId: fixture.masterId,
      status: response.status, body, allOwnedRowsUnchanged: JSON.stringify(after) === JSON.stringify(before) }) + "\n");
    expect(response.status).toBe(409); expect(body).toMatchObject({ error: { code: "WORKBENCH_SNAPSHOT_DRIFT" } }); expect(after).toEqual(before);
  });
  it("Drawing immutable assigned reviewer identity cannot be rewritten in native PostgreSQL", async () => {
    const fixture = await preparedMajorFixture("assigned-reviewer-immutable"), submission = await submitNativeDrawing(fixture.workId), id = submission.data.requestId;
    const before = await ownedLifecycleSnapshot(); let failure: { code?: string; message: string } | null = null;
    await db!.transaction(async tx => {
      await tx.execute("SAVEPOINT dev122_assignment_identity");
      try { await tx.execute("UPDATE pdm_work_review_requests SET reviewer_user_id='dev122-profile-owner' WHERE id=:id", { id }); }
      catch (error) { failure = { code: (error as { code?: string }).code, message: (error as Error).message }; }
      finally { await tx.execute("ROLLBACK TO SAVEPOINT dev122_assignment_identity"); await tx.execute("RELEASE SAVEPOINT dev122_assignment_identity"); }
    });
    await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "drawing-identity-readbacks.jsonl"), JSON.stringify({ variant: "assigned-reviewer-immutable", requestId: id,
      failure, phase: "native constraint reachability; not a route reassignment result" }) + "\n");
    expect(failure).toMatchObject({ code: "P0001", message: expect.stringContaining("DEV087_REVIEW_REQUEST_IDENTITY_IMMUTABLE") });
    expect(await ownedLifecycleSnapshot()).toEqual(before); await completeReview(submission, "approve");
  });
  it.each(["pending", "needs_info"] as const)("rejects minor with another numbering %s request without any submission effects", async state => {
    const fixture = await initialDrawingFixture("minor-pending-" + state), conflictId = crypto.randomUUID();
    await fixtureMutation("G02 lawful nonterminal master input; no release result", "UPDATE drawing_numbers SET record_status='PendingReview' WHERE id=:id", { id: fixture.masterId });
    await fixtureMutation("G02 existing numbering review conflict input, preserving native constraints", `INSERT INTO approval_requests
      (id,company_id,request_type,action_code,entity_type,entity_id,request_status,reason,payload_json,requested_by)
      VALUES(:id,'company-jenfu','numbering','dev122-historical-numbering-input','drawing_number',:masterId,:state,
        'DEV122 pending responsibility conflict input',CAST(:payload AS JSONB),'dev122-profile-owner')`,
      { id: conflictId, masterId: fixture.masterId, state, payload: JSON.stringify({ fixtureBoundary: "historical pending numbering input" }) });
    const params = { params: Promise.resolve({ workId: fixture.workId }) }, work = await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/" + fixture.workId), params));
    const before = await ownedLifecycleSnapshot(), response = await submitDrawing(request("/api/pdm/drawing-revision-works/" + fixture.workId + "/submit", ownerToken, "POST", {},
      work.data.rowVersion, work.meta.contractToken, "minor-pending-submit-" + state), params), body = await response.json();
    const after = await ownedLifecycleSnapshot();
    await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "drawing-basis-gap-readbacks.jsonl"), JSON.stringify({ variant: "minor-numbering-" + state,
      workId: fixture.workId, masterId: fixture.masterId, conflictId, status: response.status, body, allOwnedRowsUnchanged: JSON.stringify(after) === JSON.stringify(before) }) + "\n");
    expect(response.status).toBe(409); expect(body).toMatchObject({ error: { code: "WORKBENCH_SNAPSHOT_DRIFT" } });
    expect(after).toEqual(before);
    expect(await db!.queryOne("SELECT id FROM pdm_work_review_requests WHERE work_id=:id", { id: fixture.workId })).toBeNull();
  });
  it("rejects a subsequent major after actual production pointer drift with complete owned rollback", async () => {
    const fixture = await preparedMajorFixture("production-pointer-drift");
    await completeReview(await submitNativeDrawing(fixture.workId), "approve");
    const workId = await nextDrawingWork(fixture.drawingId, "production", "pointer-drift-second-major", "drawing_production"), submission = await submitNativeDrawing(workId);
    const source = await db!.queryOne<{ id: string; revision_id: string }>("SELECT id,revision_id FROM canonical_workbench_states WHERE canonical_entity_id=:id AND data_layer='drawing_production'", { id: fixture.drawingId });
    const historicalRd = await db!.queryOne<{ id: string }>("SELECT id FROM drawing_revisions WHERE company_id='company-jenfu' AND drawing_id=:id AND lifecycle_state='rd_controlled' ORDER BY created_at,id LIMIT 1", { id: fixture.drawingId });
    expect(historicalRd).toBeTruthy(); expect(historicalRd!.id).not.toBe(source!.revision_id);
    await fixtureMutation("G03 own same-Drawing historical pointer drift negative input; not an approved result", "UPDATE canonical_workbench_states SET revision_id=:revisionId WHERE id=:id AND company_id='company-jenfu'", { id: source!.id, revisionId: historicalRd!.id });
    const actualPointer = await db!.queryOne("SELECT revision_id FROM canonical_workbench_states WHERE id=:id", { id: source!.id });
    expect(actualPointer).toMatchObject({ revision_id: historicalRd!.id });
    const before = await ownedLifecycleSnapshot(), response = await nativeDrawingDecision(submission, "production-pointer-drift-decision"), body = await response.json(), after = await ownedLifecycleSnapshot();
    await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "drawing-basis-gap-readbacks.jsonl"), JSON.stringify({ variant: "production-pointer", workId,
      originalPointer: source, actualPointer, status: response.status, body, allOwnedRowsUnchanged: JSON.stringify(after) === JSON.stringify(before) }) + "\n");
    expect(response.status).toBe(409); expect(body).toMatchObject({ error: { code: "DRAWING_PRODUCTION_BASE_STALE" } }); expect(after).toEqual(before);
    await completeReview(submission, "return_for_correction");
  }, 15_000);
  it("rejects submit with no eligible current reviewer, then restores the assignment and retries",async()=>{
    const created=await ok<{partNumber:{id:string}}>(await createRecord(request("/api/numbering/records",ownerToken,"POST",
      {coreName:"DEV122 zero reviewer",itemKind:"purchased",structureType:"single_part",drawingRequested:false},1,"","zero-reviewer-number")),201);
    const partId=created.partNumber.id,started=await ok<{data:{workId:string}}>(await createPartWork(request("/api/pdm/parts/"+partId+"/change-works",
      ownerToken,"POST",{},1,await contract("dev122-profile-owner"),"zero-reviewer-work"),{params:Promise.resolve({partId})}));
    const workId=started.data.workId,params={params:Promise.resolve({workId})};
    let work=await ok<Work>(await readPartWork(request("/api/pdm/part-change-works/"+workId),params));
    await ok(await updatePartWork(request("/api/pdm/part-change-works/"+workId,ownerToken,"PATCH",{...work.data.payload,lifecycleIntent:"first_release"},
      work.data.rowVersion,work.meta.contractToken,"zero-reviewer-intent"),params));
    work=await ok<Work>(await readPartWork(request("/api/pdm/part-change-works/"+workId),params));
    await fixtureGrantAction("expire");
    try {
      const before=await ownedLifecycleSnapshot(),response=await submitPart(request("/api/pdm/part-change-works/"+workId+"/submit",ownerToken,"POST",{},
        work.data.rowVersion,work.meta.contractToken,"zero-reviewer-submit"),params),body=await response.json();
      await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"zero-reviewer-readback.json"),JSON.stringify({workId,status:response.status,body}));
      expect(response.status).toBe(409);expect(body).toMatchObject({error:{code:"WORKBENCH_BAD_REQUEST"}});
      expect(await ownedLifecycleSnapshot()).toEqual(before);
    }finally{await fixtureGrantAction("restore");}
    const submitted=await ok<Submission>(await submitPart(request("/api/pdm/part-change-works/"+workId+"/submit",ownerToken,"POST",{},
      work.data.rowVersion,work.meta.contractToken,"zero-reviewer-restored-submit"),params));await completeReview(submitted,"approve");
  });
  it("rejects Part reviewer self with complete owned rollback",async()=>{
    const fixture=await draftReleaseFixture("self-only"),id=fixture.submission.data.requestId,params={params:Promise.resolve({requestId:id})};
    const before=await ownedLifecycleSnapshot(),response=await decideReview(request("/api/pdm/review-requests/"+id+"/decisions",ownerToken,"POST",{decision:"approve"},
      fixture.submission.data.rowVersion,await contract("dev122-profile-owner"),"self-only-decision"),params),body=await response.json();
    expect(response.status).toBe(404);expect(body).toMatchObject({error:{code:"WORKBENCH_BAD_REQUEST"}});expect(await ownedLifecycleSnapshot()).toEqual(before);
    await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"part-authority-denials.jsonl"),JSON.stringify({variant:"self",status:response.status,body})+"\n");
    await completeReview(fixture.submission,"approve");
  });
  it.runIf(["authority-gaps","other-company-scope"].includes(process.env.DEV122_NATIVE_SELECTION??""))("rejects a legal other-company Principal at the workspace scope adapter with its own issuer fixture contract",async()=>{
    const fixture=await draftReleaseFixture("legal-other-company"),id=fixture.submission.data.requestId;
    const claims=verifyJenfuPrincipalSession(otherToken,getPlatformSessionKeyRing());expect(claims.companyId).toBe("company-dev122-other");
    expect(await new JenfuPrincipalSessionRegistry(db!).isActive(claims)).toBe(true);
    const otherContract=await contract("dev122-profile-other","company-dev122-other"),before=await ownedLifecycleSnapshot();
    const response=await decideReview(request("/api/pdm/review-requests/"+id+"/decisions",otherToken,"POST",{decision:"approve"},
      fixture.submission.data.rowVersion,otherContract,"legal-other-company-decision"),{params:Promise.resolve({requestId:id})}),body=await response.json();
    const after=await ownedLifecycleSnapshot();
    const identity={principalId:claims.principalId,employeeId:claims.employeeId,identityIssuer:claims.identityIssuer,identitySubject:claims.identitySubject};
    const account=await db!.queryOne("SELECT principal_id,pdm_user_id,company_id,employee_id,account_status,account_type FROM principal_accounts WHERE principal_id=:id",{id:claims.principalId});
    const assignments=await new JenfuEntitlementRepository(db!).listEffectiveAssignments(identity);
    await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"part-authority-denials.jsonl"),JSON.stringify({variant:"legal-other-company",
      principalId:claims.principalId,companyId:claims.companyId,employeeId:claims.employeeId,account,assignments,registered:true,
      contractBoundary:"source-valid issuer fixture; not evidence of other-company GET workspace permission",
      denialLayer:"existing Jenfu workspace scope adapter before request lookup",status:response.status,body,
      cacheControl:response.headers.get("cache-control"),contentType:response.headers.get("content-type"),fullOwnedRowsUnchanged:JSON.stringify(after)===JSON.stringify(before)})+"\n");
    expect(response.status).toBe(403);expect(body).toEqual({error:"entitlement_scope_mismatch"});expect(response.headers.get("cache-control")).toBe("no-store");
    expect(after).toEqual(before);
    await completeReview(fixture.submission,"approve");
  });
  it.each(["Obsolete","Merged","PendingAdminConfirm","MainDrawingInvalid"])("rejects Part terminal master %s on first release without effects",async state=>{
    const fixture=await draftReleaseFixture("terminal-"+state);
    await fixtureMutation("P03 explicit own terminal master negative input; no release outcome","UPDATE part_numbers SET record_status=:state WHERE id=:id",{state,id:fixture.partId});
    const before=await ownedLifecycleSnapshot(),response=await decideReview(request("/api/pdm/review-requests/"+fixture.submission.data.requestId+"/decisions",
      reviewerToken,"POST",{decision:"approve"},fixture.submission.data.rowVersion,await contract("dev122-profile-reviewer"),"terminal-"+state),
      {params:Promise.resolve({requestId:fixture.submission.data.requestId})});
    expect(response.status).toBe(409);expect(await response.json()).toMatchObject({error:{code:"WORKBENCH_SNAPSHOT_DRIFT"}});
    expect(await ownedLifecycleSnapshot()).toEqual(before);
  });
  it.each(["hash","status"] as const)("rejects independent Drawing master %s drift with all owned effects rolled back",async variant=>{
    const fixture=await preparedMajorFixture("drawing-master-"+variant),submission=await submitNativeDrawing(fixture.workId);
    await fixtureMutation("G03 independent Drawing master drift negative input",variant==="hash"
      ?"UPDATE drawing_numbers SET purpose_description='DEV122 concurrent purpose description' WHERE id=:id"
      :"UPDATE drawing_numbers SET record_status='Rejected' WHERE id=:id",{id:fixture.masterId});
    const before=await ownedLifecycleSnapshot(),response=await nativeDrawingDecision(submission,"drawing-master-"+variant);
    expect(response.status).toBe(409);expect(await response.json()).toMatchObject({error:{code:"WORKBENCH_SNAPSHOT_DRIFT"}});
    expect(await ownedLifecycleSnapshot()).toEqual(before);
  },15_000);
  it("rejects Drawing current assignment expiry, restores and freshly approves",async()=>{
    const fixture=await preparedMajorFixture("drawing-current-revoke"),submission=await submitNativeDrawing(fixture.workId);
    await fixtureGrantAction("expire");
    try {const before=await ownedLifecycleSnapshot(),response=await nativeDrawingDecision(submission,"drawing-current-revoked");
      expect(response.status).toBe(403);expect(await ownedLifecycleSnapshot()).toEqual(before);
    }finally{await fixtureGrantAction("restore");}
    await completeReview(submission,"approve");
    expect(await db!.queryOne("SELECT record_status FROM drawing_numbers WHERE id=:id",{id:fixture.masterId})).toMatchObject({record_status:"Released"});
  },15_000);
  it("returns a minor without changing the Released master or production pointer and resubmits normally",async()=>{
    const fixture=await preparedMajorFixture("minor-return");await completeReview(await submitNativeDrawing(fixture.workId),"approve");
    const workId=await nextDrawingWork(fixture.drawingId,"rd","minor-return-work","drawing_production");
    const master=await db!.queryOne("SELECT * FROM drawing_numbers WHERE id=:id",{id:fixture.masterId}),pointer=await db!.query(
      "SELECT * FROM canonical_workbench_states WHERE canonical_entity_id=:id AND data_layer='drawing_production' ORDER BY id",{id:fixture.drawingId});
    const submission=await submitNativeDrawing(workId);await completeReview(submission,"return_for_correction");
    expect(await db!.queryOne("SELECT owner_user_id FROM drawing_revision_works WHERE id=:id",{id:workId})).toMatchObject({owner_user_id:"dev122-profile-owner"});
    expect(await db!.queryOne("SELECT * FROM drawing_numbers WHERE id=:id",{id:fixture.masterId})).toEqual(master);
    expect(await db!.query("SELECT * FROM canonical_workbench_states WHERE canonical_entity_id=:id AND data_layer='drawing_production' ORDER BY id",{id:fixture.drawingId})).toEqual(pointer);
    const next=await submitNativeDrawing(workId,"minor-return-fresh-resubmit");expect(next.data.requestId).not.toBe(submission.data.requestId);
    await completeReview(next,"approve");
    expect(await db!.queryOne("SELECT * FROM drawing_numbers WHERE id=:id",{id:fixture.masterId})).toEqual(master);
    expect(await db!.query("SELECT * FROM canonical_workbench_states WHERE canonical_entity_id=:id AND data_layer='drawing_production' ORDER BY id",{id:fixture.drawingId})).toEqual(pointer);
  },15_000);
  it.each(["NeedInfo", "Rejected", "Active", "PendingReview", "Obsolete", "Merged", "PendingAdminConfirm", "MainDrawingInvalid"])("rejects major start from actual %s master without a release effect", async state => {
    const fixture = await preparedMajorFixture("major-state-" + state);
    await fixtureMutation("G03 legal historical master status negative input; not a release outcome", "UPDATE drawing_numbers SET record_status=:state WHERE id=:id", { id: fixture.masterId, state });
    const work = await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/" + fixture.workId), { params: Promise.resolve({ workId: fixture.workId }) }));
    const before = await ownedLifecycleSnapshot();
    const response = await submitDrawing(request("/api/pdm/drawing-revision-works/" + fixture.workId + "/submit", ownerToken, "POST", {},
      work.data.rowVersion, work.meta.contractToken, "major-state-submit-" + state), { params: Promise.resolve({ workId: fixture.workId }) });
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ error: { code: "WORKBENCH_SNAPSHOT_DRIFT" } });
    expect(await ownedLifecycleSnapshot()).toEqual(before);
  }, 15_000);
  it.each(["Draft", "NeedInfo", "Rejected", "Active", "PendingReview", "Released"])("approves minor with legal %s master without changing master or production pointer", async state => {
    const fixture = await initialDrawingFixture("minor-state-" + state); let workId = fixture.workId;
    if (state === "Released") {
      await completeReview(await submitNativeDrawing(workId), "approve");
      workId = await nextDrawingWork(fixture.drawingId, "production", "minor-released-first-major");
      await completeReview(await submitNativeDrawing(workId), "approve");
      workId = await nextDrawingWork(fixture.drawingId, "rd", "minor-on-released", "drawing_production");
    } else if (state !== "Draft") await fixtureMutation("G02 legal nonterminal historical master input, not an approved lifecycle result", "UPDATE drawing_numbers SET record_status=:state WHERE id=:id", { id: fixture.masterId, state });
    const masterBefore = await db!.queryOne("SELECT * FROM drawing_numbers WHERE id=:id", { id: fixture.masterId });
    const pointerBefore = await db!.query("SELECT * FROM canonical_workbench_states WHERE canonical_entity_id=:id AND data_layer='drawing_production' ORDER BY id", { id: fixture.drawingId });
    const unrelatedParts = await db!.query("SELECT * FROM part_numbers ORDER BY id");
    await completeReview(await submitNativeDrawing(workId), "approve");
    expect(await db!.queryOne("SELECT * FROM drawing_numbers WHERE id=:id", { id: fixture.masterId })).toEqual(masterBefore);
    expect(await db!.query("SELECT * FROM canonical_workbench_states WHERE canonical_entity_id=:id AND data_layer='drawing_production' ORDER BY id", { id: fixture.drawingId })).toEqual(pointerBefore);
    expect(await db!.query("SELECT * FROM part_numbers ORDER BY id")).toEqual(unrelatedParts);
  }, 15_000);
  it("approves a subsequent major from a normally Released master with concurrent approval and exact replay", async () => {
    const fixture = await preparedMajorFixture("subsequent-major"); await completeReview(await submitNativeDrawing(fixture.workId), "approve");
    expect(await db!.queryOne("SELECT record_status FROM drawing_numbers WHERE id=:id", { id: fixture.masterId })).toMatchObject({ record_status: "Released" });
    const pointerBefore = await db!.queryOne("SELECT revision_id FROM canonical_workbench_states WHERE canonical_entity_id=:id AND data_layer='drawing_production'", { id: fixture.drawingId });
    const unrelatedMasters = await db!.query("SELECT * FROM drawing_numbers WHERE id<>:id ORDER BY id", { id: fixture.masterId });
    const parts = await db!.query("SELECT * FROM part_numbers ORDER BY id");
    const workId = await nextDrawingWork(fixture.drawingId, "production", "subsequent-second-major", "drawing_production"), submission = await submitNativeDrawing(workId);
    const keys = ["drawing-race-a", "drawing-race-b"], responses = await Promise.all(keys.map(key => nativeDrawingDecision(submission, key)));
    expect(responses.filter(response => response.status === 200)).toHaveLength(1); const winner = responses.findIndex(response => response.status === 200);
    expect([404, 409]).toContain(responses[1 - winner].status);
    expect(await db!.queryOne("SELECT revision_id FROM canonical_workbench_states WHERE canonical_entity_id=:id AND data_layer='drawing_production'", { id: fixture.drawingId })).not.toEqual(pointerBefore);
    expect(await db!.queryOne("SELECT count(*)::int AS count FROM canonical_workbench_states WHERE canonical_entity_id=:id AND data_layer='drawing_production'", { id: fixture.drawingId })).toMatchObject({ count: 1 });
    expect(await db!.query("SELECT * FROM drawing_numbers WHERE id<>:id ORDER BY id", { id: fixture.masterId })).toEqual(unrelatedMasters);
    expect(await db!.query("SELECT * FROM part_numbers ORDER BY id")).toEqual(parts);
    const beforeReplay = await ownedLifecycleSnapshot(); await ok(await nativeDrawingDecision(submission, keys[winner])); expect(await ownedLifecycleSnapshot()).toEqual(beforeReplay);
    const collision = await nativeDrawingDecision(submission, keys[winner], "return_for_correction"); expect(collision.status).toBe(422);
    expect(await collision.json()).toMatchObject({ error: { code: "IDEMPOTENCY_KEY_REUSED" } }); expect(await ownedLifecycleSnapshot()).toEqual(beforeReplay);
  }, 15_000);
  it.each(["counter", "lifecycle"] as const)("rejects old major basis missing %s then returns and resubmits current basis", async missing => {
    const fixture = await preparedMajorFixture("old-major-" + missing), originalSubmission = await submitNativeDrawing(fixture.workId), originalId = originalSubmission.data.requestId;
    const row = await db!.queryOne<{ snapshot_payload: ReviewPackageEnvelope; snapshot_hash: string; canonical_entity_id: string; branch_id: string; reviewer_user_id: string; review_cycle_id: string }>("SELECT snapshot_payload,snapshot_hash,canonical_entity_id,branch_id,reviewer_user_id,review_cycle_id FROM pdm_work_review_requests WHERE id=:id", { id: originalId });
    const envelope = structuredClone(row!.snapshot_payload), work = await new DrawingRevisionWorkAsyncRepository(db!).readWork(db!, "company-jenfu", fixture.workId);
    expect(work).toBeTruthy();
    delete envelope.decisionBasis.workRowVersion;
    if (missing === "lifecycle") { delete envelope.decisionBasis.lifecycle; envelope.decisionBasis.version = 1; }
    const rawPayload = typeof work!.proposed_payload === "string" ? JSON.parse(work!.proposed_payload) : work!.proposed_payload;
    envelope.decisionBasis.hash = reviewDecisionBasisHash({ kind: "drawing_revision_work", payload: sanitizeDrawingRevisionWorkPayload(rawPayload),
      revisionId: work!.revision_id, claimId: work!.target_claim_id, ...(envelope.decisionBasis.lifecycle ? { lifecycle: envelope.decisionBasis.lifecycle } : {}) });
    const { packageHash: _previousHash, ...body } = envelope; envelope.packageHash = reviewPackageHash(body);
    const artifact = path.join(process.env.DEV122_EVIDENCE_ROOT!, "old-major-" + missing + "-fixture.json"), artifactBytes = JSON.stringify({ original: row, historicalFixtureInput: envelope });
    await fs.writeFile(artifact, artifactBytes);
    // Reach the real immutable trigger without changing the active package.
    const immutableFailure = await db!.transaction(async tx => {
      await tx.execute("SAVEPOINT dev122_old_major_immutable");
      let failure: { code?: string; message: string } | null = null;
      try { await tx.execute("UPDATE pdm_work_review_requests SET snapshot_payload=CAST(:payload AS jsonb),snapshot_hash=:hash WHERE id=:id",
        { id: originalId, payload: JSON.stringify(envelope), hash: envelope.packageHash }); }
      catch (error) { const native = error as Error & { code?: string }; failure = { code: native.code, message: native.message }; }
      finally { await tx.execute("ROLLBACK TO SAVEPOINT dev122_old_major_immutable"); await tx.execute("RELEASE SAVEPOINT dev122_old_major_immutable"); }
      return failure;
    });
    expect(immutableFailure).toMatchObject({ code: "P0001", message: "DEV087_REVIEW_REQUEST_IDENTITY_IMMUTABLE" });
    expect(await db!.queryOne("SELECT snapshot_payload,snapshot_hash,canonical_entity_id,branch_id,reviewer_user_id,review_cycle_id FROM pdm_work_review_requests WHERE id=:id", { id: originalId })).toEqual(row);
    await fs.writeFile(artifact + ".immutable-readback.json", JSON.stringify({ originalId, immutableFailure, originalArtifactHash: createHash("sha256").update(artifactBytes).digest("hex") }));
    await completeReview(originalSubmission, "return_for_correction");
    expect(await db!.queryOne("SELECT id FROM pdm_work_review_requests WHERE id=:id", { id: originalId })).toBeNull();
    expect(await db!.queryOne("SELECT request_id FROM pdm_work_review_terminal_receipts WHERE request_id=:id", { id: originalId })).toMatchObject({ request_id: originalId });
    expect(await db!.queryOne("SELECT review_cycle_id FROM pdm_review_traces WHERE review_cycle_id=:id", { id: row!.review_cycle_id })).toBeTruthy();
    const id = crypto.randomUUID(), reviewCycleId = crypto.randomUUID(), submission: Submission = { data: { requestId: id, rowVersion: 1 } };
    await fixtureMutation("G03 historical pending old-basis INSERT after actual return; no approved result or counter invention", `INSERT INTO pdm_work_review_requests
      (id,company_id,request_kind,entity_type,canonical_entity_id,work_id,branch_id,reviewer_user_id,review_cycle_id,snapshot_payload,snapshot_hash,request_status,row_version)
      VALUES(:id,'company-jenfu','drawing_revision','drawing',:drawingId,:workId,:branchId,:reviewerId,:cycle,CAST(:payload AS jsonb),:hash,'pending',1)`,
      { id, drawingId: row!.canonical_entity_id, workId: fixture.workId, branchId: row!.branch_id, reviewerId: row!.reviewer_user_id, cycle: reviewCycleId, payload: JSON.stringify(envelope), hash: envelope.packageHash });
    await fixtureMutation("G03 historical pending canonical owner/review state prerequisite", "UPDATE canonical_workbench_states SET handling='review_owner',row_version=row_version+1 WHERE company_id='company-jenfu' AND work_id=:id AND handling='owner'", { id: fixture.workId });
    await fixtureMutation("G03 historical pending revision state prerequisite", "UPDATE drawing_revisions SET lifecycle_state='in_review' WHERE company_id='company-jenfu' AND id=:id AND lifecycle_state='correction_required'", { id: work!.revision_id });
    expect(await db!.queryOne("SELECT snapshot_payload,snapshot_hash,request_status,row_version FROM pdm_work_review_requests WHERE id=:id", { id })).toEqual({ snapshot_payload: envelope, snapshot_hash: envelope.packageHash, request_status: "pending", row_version: 1 });
    expect(await db!.queryOne("SELECT handling FROM canonical_workbench_states WHERE company_id='company-jenfu' AND work_id=:id", { id: fixture.workId })).toMatchObject({ handling: "review_owner" });
    const before = await ownedLifecycleSnapshot(), rejected = await nativeDrawingDecision(submission, "old-major-reject-" + missing);
    const rejectedBody = await rejected.json();
    expect(rejected.status).toBe(409); expect(rejectedBody).toMatchObject({ error: { code: "WORKBENCH_REVIEW_PACKAGE_INVALID" } }); expect(await ownedLifecycleSnapshot()).toEqual(before);
    await completeReview(submission, "return_for_correction");
    const fresh = await submitNativeDrawing(fixture.workId, "old-major-fresh-resubmit-" + missing);
    expect(fresh.data.requestId).not.toBe(id); expect(fresh.data.requestId).not.toBe(originalId);
    const freshPackage = await db!.queryOne("SELECT snapshot_payload,snapshot_hash FROM pdm_work_review_requests WHERE id=:id", { id: fresh.data.requestId });
    await completeReview(fresh, "approve");
    expect(await db!.queryOne("SELECT record_status FROM drawing_numbers WHERE id=:id", { id: fixture.masterId })).toMatchObject({ record_status: "Released" });
    expect(await fs.readFile(artifact, "utf8")).toBe(artifactBytes);
    await fs.writeFile(artifact + ".outcome.json", JSON.stringify({ originalId, historicalRequestId: id, immutableFailure,
      rejected: { status: rejected.status, body: rejectedBody }, historicalReturn: "ACTUAL_ROUTE_COMPLETED",
      freshCommandKey: "old-major-fresh-resubmit-" + missing, fresh, freshPackage, freshApproval: "ACTUAL_ROUTE_COMPLETED",
      originalArtifactHash: createHash("sha256").update(await fs.readFile(artifact)).digest("hex") }));
  }, 15_000);
  it.each([{ unmapped: false, title: "freezes mapped Drawing work version and rejects independent drift" },
    { unmapped: true, title: "rejects a malformed unmapped primary before submit without approval effects" }])("$title", async ({ unmapped }) => {
    const label = "drawing-counter-" + unmapped;
    const created = await ok<{ drawingNumber: { id: string } }>(await createRecord(request("/api/numbering/records", ownerToken, "POST",
      { coreName: "DEV122 " + label, itemKind: "manufactured", structureType: "single_part", drawingRequested: true, drawingPurposeCode: "M" },
      1, "", label + "-number")), 201);
    const initial = await db!.queryOne<{ id: string; drawing_id: string }>(`SELECT work.id,work.drawing_id FROM drawing_revision_works work
      JOIN drawings drawing ON drawing.id=work.drawing_id WHERE drawing.formal_drawing_number_id=:id`, { id: created.drawingNumber.id });
    expect(initial).toBeTruthy();
    if (unmapped) await fixtureMutation("G03 malformed primary mapping negative input, not a lawful legacy submit or release outcome",
      "UPDATE drawings SET formal_drawing_number_id=NULL WHERE id=:id AND company_id='company-jenfu'", { id: initial!.drawing_id });
    await uploadNativeProtocolPair(initial!.id, label);
    const params = { params: Promise.resolve({ workId: initial!.id }) };
    const work = await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/" + initial!.id), params));
    if (unmapped) {
      const before = await ownedLifecycleSnapshot();
      const response = await submitDrawing(request("/api/pdm/drawing-revision-works/" + initial!.id + "/submit", ownerToken, "POST",
        {}, work.data.rowVersion, work.meta.contractToken, label + "-submit"), params);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: "WORKBENCH_REVIEW_PACKAGE_INVALID" } });
      expect(await ownedLifecycleSnapshot()).toEqual(before);
      expect(await db!.queryOne<{ count: number }>("SELECT count(*)::int AS count FROM pdm_work_review_requests WHERE work_id=:id", { id: initial!.id }))
        .toMatchObject({ count: 0 });
      return; // This malformed mapping never reaches the work-counter decision gate.
    }
    const submission = await submitNativeDrawing(initial!.id), id = submission.data.requestId;
    const frozen = await db!.queryOne<{ snapshot_payload: { decisionBasis: { version: number; workRowVersion: number; lifecycle?: unknown } } }>(
      "SELECT snapshot_payload FROM pdm_work_review_requests WHERE id=:id", { id });
    expect(frozen!.snapshot_payload.decisionBasis.workRowVersion).toBe(work.data.rowVersion);
    await fixtureMutation("G03 independent submitted work counter drift with unchanged payload",
      "UPDATE drawing_revision_works SET row_version=row_version+1 WHERE id=:id", { id: initial!.id });
    const before = await ownedLifecycleSnapshot();
    const response = await decideReview(request("/api/pdm/review-requests/" + id + "/decisions", reviewerToken, "POST", { decision: "approve" },
      submission.data.rowVersion, await contract("dev122-profile-reviewer"), label + "-decision"), { params: Promise.resolve({ requestId: id }) });
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ error: { code: "WORKBENCH_SNAPSHOT_DRIFT" } });
    expect(await ownedLifecycleSnapshot()).toEqual(before);
  });
  it("returns a first-release Part to its original owner and resubmits a fresh immutable package before approval", async () => {
    const fixture = await draftReleaseFixture("return-resubmit"), oldId = fixture.submission.data.requestId;
    const originalPackage = await db!.queryOne<{ snapshot_hash: string; snapshot_payload: unknown }>(
      "SELECT snapshot_hash,snapshot_payload FROM pdm_work_review_requests WHERE id=:id", { id: oldId });
    expect(originalPackage).toBeTruthy();
    await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "part-return-original-package.json"), JSON.stringify(originalPackage));
    await completeReview(fixture.submission, "return_for_correction");
    expect(await db!.queryOne("SELECT record_status FROM part_numbers WHERE id=:id", { id: fixture.partId })).toMatchObject({ record_status: "Draft" });
    expect(await db!.queryOne("SELECT owner_user_id FROM part_change_works WHERE id=:id", { id: fixture.workId })).toMatchObject({ owner_user_id: "dev122-profile-owner" });
    const params = { params: Promise.resolve({ workId: fixture.workId }) };
    let work = await ok<Work>(await readPartWork(request("/api/pdm/part-change-works/" + fixture.workId), params));
    const beforeDenied = await ownedLifecycleSnapshot();
    const denied = await updatePartWork(request("/api/pdm/part-change-works/" + fixture.workId, reviewerToken, "PATCH",
      { ...work.data.payload, partName: "nonowner cannot edit" }, work.data.rowVersion, await contract("dev122-profile-reviewer"), "returned-nonowner"), params);
    expect(denied.status).toBe(403); expect(await ownedLifecycleSnapshot()).toEqual(beforeDenied);
    await ok(await updatePartWork(request("/api/pdm/part-change-works/" + fixture.workId, ownerToken, "PATCH",
      { ...work.data.payload, partName: "Returned owner correction", lifecycleIntent: "first_release" }, work.data.rowVersion, work.meta.contractToken, "returned-owner-edit"), params));
    work = await ok<Work>(await readPartWork(request("/api/pdm/part-change-works/" + fixture.workId), params));
    const next = await ok<Submission>(await submitPart(request("/api/pdm/part-change-works/" + fixture.workId + "/submit", ownerToken, "POST", {},
      work.data.rowVersion, work.meta.contractToken, "returned-owner-resubmit"), params));
    expect(next.data.requestId).not.toBe(oldId);
    const nextPackage = await db!.queryOne<{ snapshot_hash: string }>("SELECT snapshot_hash FROM pdm_work_review_requests WHERE id=:id", { id: next.data.requestId });
    expect(nextPackage!.snapshot_hash).not.toBe(originalPackage!.snapshot_hash);
    expect(await db!.queryOne("SELECT request_id FROM pdm_work_review_terminal_receipts WHERE request_id=:id", { id: oldId })).toBeTruthy();
    expect(await db!.queryOne("SELECT id FROM part_approved_change_snapshots WHERE part_id=:id", { id: fixture.partId })).toBeNull();
    await completeReview(next, "approve");
    expect(await db!.queryOne("SELECT record_status,part_name FROM part_numbers WHERE id=:id", { id: fixture.partId })).toMatchObject({ record_status: "Released", part_name: "Returned owner correction" });
  });
  it.each(["work_version", "formal_version", "formal_payload", "master_status", "master_hash"] as const)("rejects native %s drift with all owned rows unchanged by the rejected decision", async variant => {
    const fixture = await draftReleaseFixture("independent-" + variant), id = fixture.submission.data.requestId;
    const drift = {
      work_version: ["UPDATE part_change_works SET row_version=row_version+1 WHERE id=:id", fixture.workId],
      formal_version: ["UPDATE canonical_workbench_states SET row_version=row_version+1 WHERE canonical_entity_id=:id AND data_layer='part_formal'", fixture.partId],
      formal_payload: ["INSERT INTO part_variant_attributes(id,part_number_id,surface_treatment,updated_by) VALUES(:attributeId,:id,'DEV122 independent formal attribute drift','dev122-profile-owner') ON CONFLICT(part_number_id) DO UPDATE SET surface_treatment=excluded.surface_treatment", fixture.partId],
      master_status: ["UPDATE part_numbers SET record_status='Rejected' WHERE id=:id", fixture.partId],
      master_hash: ["UPDATE part_numbers SET part_name='DEV122 concurrent master payload' WHERE id=:id", fixture.partId]
    }[variant]!;
    const masterBefore=variant==="formal_payload"?await db!.queryOne("SELECT * FROM part_numbers WHERE id=:id",{id:fixture.partId}):null;
    await fixtureMutation("P04 explicit independent drift negative input; not a release outcome", drift[0], { id: drift[1],attributeId:crypto.randomUUID() });
    if(variant==="formal_payload") {
      expect(await db!.queryOne("SELECT surface_treatment FROM part_variant_attributes WHERE part_number_id=:id",{id:fixture.partId}))
        .toMatchObject({surface_treatment:"DEV122 independent formal attribute drift"});
      expect(await db!.queryOne("SELECT * FROM part_numbers WHERE id=:id",{id:fixture.partId})).toEqual(masterBefore);
    }
    const beforeDecision = await ownedLifecycleSnapshot();
    const response = await decideReview(request("/api/pdm/review-requests/" + id + "/decisions", reviewerToken, "POST", { decision: "approve" },
      fixture.submission.data.rowVersion, await contract("dev122-profile-reviewer"), "drift-" + variant), { params: Promise.resolve({ requestId: id }) });
    expect(response.status).toBe(409);
    expect(await ownedLifecycleSnapshot()).toEqual(beforeDecision);
    expect(await db!.queryOne("SELECT id FROM part_approved_change_snapshots WHERE part_id=:id", { id: fixture.partId })).toBeNull();
  });
  it("rolls back all Part effects when the frozen native work deletion CAS affects zero rows", async () => {
    const fixture = await draftReleaseFixture("delete-cas-zero"), id = fixture.submission.data.requestId;
    const before = await ownedLifecycleSnapshot(), original = PartChangeWorkAsyncRepository.prototype.formalize;
    let injected = false, deleteReached = 0, deleteCompleted = 0, deletedRows: number | null = null;
    const readbackPath = path.join(process.env.DEV122_EVIDENCE_ROOT!, "part-delete-cas-zero-readback.json");
    await fs.writeFile(readbackPath, JSON.stringify({ before, after: null, deleteReached, deleteCompleted, deletedRows }));
    const callback = vi.spyOn(PartChangeWorkAsyncRepository.prototype, "formalize").mockImplementationOnce(async function (this: PartChangeWorkAsyncRepository, tx, input) {
      expect(input.expectedWorkRowVersion).toBe(Number(input.work.row_version));
      const sql = "UPDATE part_change_works SET row_version=row_version+1 WHERE id=:id AND row_version=:frozen";
      const params = { id: input.work.id, frozen: input.expectedWorkRowVersion! };
      await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "fixture-mutations.jsonl"), JSON.stringify({
        project: "AIPDM", purpose: "same-transaction native deletion-CAS negative callback; not a business result",
        producerBoundary: "FIXTURE", sql, params }) + "\n");
      await tx.execute(sql, params); injected = true;
      const nativeQuery = tx.query.bind(tx);
      const observer = vi.spyOn(tx, "query").mockImplementation(async <Row>(querySql: string, binds?: AsyncDatabaseQueryParams): Promise<Row[]> => {
        const exactDelete = querySql.includes("DELETE FROM part_change_works") && querySql.includes("row_version = :expectedWorkRowVersion RETURNING id");
        if (exactDelete) deleteReached += 1;
        const rows = await nativeQuery<Row>(querySql, binds);
        if (exactDelete) {
          deleteCompleted += 1; deletedRows = rows.length;
          await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "fixture-mutations.jsonl"), JSON.stringify({
            project: "AIPDM", purpose: "transparent native frozen deletion CAS observation", querySql, binds,
            deleteReached, deleteCompleted, rowCount: rows.length }) + "\n");
        }
        return rows;
      });
      try { return await original.call(this, tx, input); }
      finally { observer.mockRestore(); }
    });
    try {
      const response = await decideReview(request("/api/pdm/review-requests/" + id + "/decisions", reviewerToken, "POST", { decision: "approve" },
        fixture.submission.data.rowVersion, await contract("dev122-profile-reviewer"), "delete-cas-zero-decision"), { params: Promise.resolve({ requestId: id }) });
      const after = await ownedLifecycleSnapshot();
      await fs.writeFile(readbackPath, JSON.stringify({ before, after, deleteReached, deleteCompleted, deletedRows }));
      expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ error: { code: "WORKBENCH_SNAPSHOT_DRIFT" } });
      expect(after).toEqual(before);
    } finally {
      callback.mockRestore(); expect(injected).toBe(true);
      expect(deleteReached).toBe(1); expect(deleteCompleted).toBe(1); expect(deletedRows).toBe(0);
    }
  });
  it("serializes two native approvals to one release and rejects a completed-key decision collision", async () => {
    const fixture = await draftReleaseFixture("two-approve"), id = fixture.submission.data.requestId;
    const reviewerContract = await contract("dev122-profile-reviewer"), params = { params: Promise.resolve({ requestId: id }) };
    const keys = ["two-approve-a", "two-approve-b"];
    const decide = (key: string, decision = "approve") => decideReview(request("/api/pdm/review-requests/" + id + "/decisions", reviewerToken, "POST",
      { decision }, fixture.submission.data.rowVersion, reviewerContract, key), params);
    const responses = await Promise.all(keys.map(key => decide(key)));
    expect(responses.filter(response => response.status === 200)).toHaveLength(1);
    const winner = responses.findIndex(response => response.status === 200), loser = responses[1 - winner];
    expect([404, 409]).toContain(loser.status);
    const rejected = await loser.json();
    expect(["WORKBENCH_BAD_REQUEST", "WORKBENCH_REVIEW_REQUEST_STALE", "WORKBENCH_ROW_VERSION_CONFLICT"]).toContain(rejected.error.code);
    expect(await db!.queryOne("SELECT count(*)::int AS count FROM part_approved_change_snapshots WHERE part_id=:id", { id: fixture.partId })).toMatchObject({ count: 1 });
    expect(await db!.queryOne("SELECT count(*)::int AS count FROM pdm_work_review_terminal_receipts WHERE request_id=:id", { id })).toMatchObject({ count: 1 });
    expect(await db!.queryOne("SELECT count(*)::int AS count FROM platform_command_receipts WHERE effect_key=:effect AND command_name=:command AND command_status='completed'",
      { effect: "review:" + id, command: "dev087:review.decision" })).toMatchObject({ count: 1 });
    const beforeReplay = await ownedLifecycleSnapshot();
    await ok(await decide(keys[winner])); expect(await ownedLifecycleSnapshot()).toEqual(beforeReplay);
    const collision = await decide(keys[winner], "return_for_correction"); expect(collision.status).toBe(422);
    expect(await collision.json()).toMatchObject({ error: { code: "IDEMPOTENCY_KEY_REUSED" } });
    expect(await ownedLifecycleSnapshot()).toEqual(beforeReplay);
  });
  it("revokes the actual published reviewer assignment after submit, denies with no effects, then restores and retries", async () => {
    const fixture = await draftReleaseFixture("live-revoke"), id = fixture.submission.data.requestId;
    const reviewerContract = await contract("dev122-profile-reviewer");
    await fixtureGrantAction("expire");
    try {
      const before = await ownedLifecycleSnapshot();
      // Private read-only diagnosis calls the actual consumer against actual
      // expired rows; no guard/evaluator/result replacement or business writes.
      const diagnosis = await db!.transaction(async tx => {
        const input = { principalId: "dev122-principal-reviewer", employeeId: "dev122-employee-reviewer",
          identityIssuer: "https://securetoken.google.com/dev122-local-fixture", identitySubject: "dev122-subject-reviewer" };
        const time = await tx.queryOne<{ decision_at: string }>("SELECT transaction_timestamp()::text AS decision_at");
        const assignments = await new JenfuEntitlementRepository(tx).listEffectiveAssignments(input);
        let error: { message: string; code: unknown; stack: string | undefined } | null = null;
        try { await validatePrincipalPublishedGrantSnapshot(tx, input); }
        catch (caught) { const actual = caught as Error & { code?: unknown }; error = { message: actual.message, code: actual.code ?? null, stack: actual.stack }; }
        return { decisionAt: time!.decision_at, assignments, issues: assignments.map(assignment =>
          validateEffectiveRoleAssignment(assignment, input, new Date(time!.decision_at))), error };
      }, { readOnly: true, isolationLevel: "repeatable_read" });
      const response = await decideReview(request("/api/pdm/review-requests/" + id + "/decisions", reviewerToken, "POST", { decision: "approve" },
        fixture.submission.data.rowVersion, reviewerContract, "live-revoked-reviewer"), { params: Promise.resolve({ requestId: id }) });
      const body = await response.clone().json();
      await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "reviewer-expiry-private-readback.json"), JSON.stringify({ diagnosis,
        actualRoute: { status: response.status, body }, boundary: "FIXTURE consumer-only read-only diagnosis" }));
      expect(await ownedLifecycleSnapshot()).toEqual(before);
      expect(response.status, JSON.stringify(body)).toBe(403);
      expect(await db!.queryOne("SELECT request_status FROM pdm_work_review_requests WHERE id=:id", { id })).toMatchObject({ request_status: "pending" });
    } finally { await fixtureGrantAction("restore"); }
    await completeReview(fixture.submission, "approve");
    expect(await db!.queryOne("SELECT record_status FROM part_numbers WHERE id=:id", { id: fixture.partId })).toMatchObject({ record_status: "Released" });
    // Role-assignment expiry revokes decide+publish together, not separately.
  });
  it("enforces the native 077 approval-context CHECK truth boundary while allowing legacy SQL NULL", async () => {
    const constraints = await db!.query<{ expression: string }>(`SELECT pg_get_expr(constraint_row.conbin,constraint_row.conrelid) AS expression
      FROM pg_catalog.pg_constraint constraint_row JOIN pg_catalog.pg_attribute column_row
        ON column_row.attrelid=constraint_row.conrelid AND column_row.attnum=ANY(constraint_row.conkey)
      WHERE constraint_row.conrelid='ai_pdm_core.part_approved_change_snapshots'::regclass
        AND constraint_row.contype='c' AND column_row.attname='approval_context'`);
    expect(constraints).toHaveLength(1);
    for (const [value, accepted] of [[null, true], [{ version: 1 }, true], [{}, false], [{ version: null }, false],
      [1, false], [[], false], [{ version: 2 }, false]] as const) {
      const result = await db!.queryOne<{ accepted: boolean | null }>(`SELECT (${constraints[0].expression}) AS accepted
        FROM (SELECT CAST(:context AS jsonb) AS approval_context) fixture`, { context: value === null ? null : JSON.stringify(value) });
      expect(result?.accepted === true || result?.accepted === null, JSON.stringify(value)).toBe(accepted);
    }
    // This is the provider's CHECK expression gate, not an INSERT or whole-app assertion.
  });
  it("keeps a minor master Draft, then atomically releases the exact major master after post-formalize rollback and replay", async () => {
    const created = await ok<{ drawingNumber: { id: string } }>(await createRecord(request("/api/numbering/records", ownerToken, "POST",
      { coreName: "DEV122 exact major rollback", itemKind: "manufactured", structureType: "single_part", drawingRequested: true, drawingPurposeCode: "M" }, 1, "", "major-number")), 201);
    const initial = await db!.queryOne<{ id: string; drawing_id: string }>(`SELECT work.id,work.drawing_id
      FROM drawing_revision_works work JOIN drawings drawing ON drawing.id=work.drawing_id
      WHERE drawing.formal_drawing_number_id=:id`, { id: created.drawingNumber.id });
    expect(initial).toBeTruthy();
    await uploadNativeProtocolPair(initial!.id, "minor");
    await completeReview(await submitNativeDrawing(initial!.id), "approve");
    expect(await db!.queryOne("SELECT record_status FROM drawing_numbers WHERE id=:id", { id: created.drawingNumber.id })).toMatchObject({ record_status: "Draft" });
    const source = await db!.queryOne<{ id: string }>(`SELECT id FROM canonical_workbench_states
      WHERE canonical_entity_id=:id AND data_layer='drawing_rd' AND handling='none' AND work_id IS NULL`, { id: initial!.drawing_id });
    expect(source).toBeTruthy();
    const drawingParams = { params: Promise.resolve({ drawingId: initial!.drawing_id }) };
    const targets = await ok<{ data: { source: { rowVersion: number }; candidates: Array<{ kind: string; enabled: boolean; candidateToken: string | null }> }; meta: { contractToken: string } }>(
      await readDrawingTargets(request(`/api/pdm/drawings/${initial!.drawing_id}/revision-targets?sourceRowKey=cw_${source!.id}`), drawingParams));
    const production = targets.data.candidates.find(candidate => candidate.kind === "production" && candidate.enabled);
    expect(production?.candidateToken).toBeTruthy();
    const start = await ok<{ data: { workId: string } }>(await createDrawingWork(request(`/api/pdm/drawings/${initial!.drawing_id}/revision-works`, ownerToken, "POST",
      { sourceRowKey: "cw_" + source!.id, selectionMode: "recommended", candidateToken: production!.candidateToken },
      targets.data.source.rowVersion, targets.meta.contractToken, "major-work"), drawingParams));
    const workId = start.data.workId;
    await uploadNativeProtocolPair(workId, "major");
    const params = { params: Promise.resolve({ workId }) };
    let work = await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/" + workId), params));
    const impact = work.data.payload.changeImpact as Record<string, unknown>;
    await ok(await updateDrawingWork(request("/api/pdm/drawing-revision-works/" + workId, ownerToken, "PATCH",
      { ...work.data.payload, changeImpact: { ...impact, formState: "no_impact", fitState: "no_impact", functionState: "no_impact" } },
      work.data.rowVersion, work.meta.contractToken, "major-fff"), params));
    work = await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/" + workId), params));
    const submission = await submitNativeDrawing(workId);
    const before = await ownedLifecycleSnapshot();
    const original = DrawingRevisionWorkAsyncRepository.prototype.formalize;
    let completed = false;
    const fault = vi.spyOn(DrawingRevisionWorkAsyncRepository.prototype, "formalize").mockImplementationOnce(async function (this: DrawingRevisionWorkAsyncRepository, tx, input) {
      await original.call(this, tx, input); completed = true;
      throw new Error("DEV122_POST_DRAWING_FORMALIZE_FAULT");
    });
    try {
      const id = submission.data.requestId;
      const response = await decideReview(request("/api/pdm/review-requests/" + id + "/decisions", reviewerToken, "POST", { decision: "approve" },
        submission.data.rowVersion, await contract("dev122-profile-reviewer"), "major-fault"), { params: Promise.resolve({ requestId: id }) });
      expect(fault).toHaveBeenCalledTimes(1); expect(completed).toBe(true);
      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const body = await response.json();
      expect(body).toMatchObject({ error: { code: "WORKBENCH_INTERNAL_ERROR", message: "操作失敗，請稍後再試" } });
      expect(JSON.stringify(body)).not.toMatch(/POST_DRAWING|SQL|stack/u);
    } finally { fault.mockRestore(); }
    expect(await ownedLifecycleSnapshot()).toEqual(before);
    await completeReview(submission, "approve");
    expect(await db!.queryOne("SELECT record_status FROM drawing_numbers WHERE id=:id", { id: created.drawingNumber.id })).toMatchObject({ record_status: "Released" });
    expect(await db!.queryOne<{ count: number }>(`SELECT count(*)::int AS count FROM canonical_workbench_states state
      JOIN drawing_revisions revision ON revision.id=state.revision_id
      WHERE state.canonical_entity_id=:id AND state.data_layer='drawing_production' AND revision.lifecycle_state='released'`, { id: initial!.drawing_id })).toMatchObject({ count: 1 });
  });
  it("uses normal Draft creation and release-only review before a real transfer can be submitted and approved",async()=>{
    const fixture=await draftReleaseFixture("transfer");
    const intake=await ok<{workbench:{id:string;rowVersion:number}}>(await createTransfer(request("/api/transfer-packages",ownerToken,"POST",
      {title:"DEV122 normal released Part transfer",caseType:"development_case",caseReason:"Native lifecycle acceptance",
       sourceReferenceStatus:"not_available",sourceReferenceReason:"Task-owned synthetic intake"},1,"","lifecycle-transfer-create")),201);
    const packageId=intake.workbench.id,params={params:Promise.resolve({id:packageId})};
    await ok(await addTransferItem(request("/api/transfer-packages/"+packageId+"/items",ownerToken,"POST",
      {expectedRowVersion:intake.workbench.rowVersion,entityType:"part_number",entityId:fixture.partId},1,"","lifecycle-transfer-item"),params));
    let readiness=await db!.transaction(tx=>buildTransferPackageReadiness(packageId,"company-jenfu",tx),{readOnly:true});
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.map(b=>b.code)).toContain("transfer_official_item_invalid");
    await completeReview(fixture.submission,"approve");
    expect(await db!.queryOne("SELECT record_status FROM part_numbers WHERE id=:id",{id:fixture.partId})).toMatchObject({record_status:"Released"});
    const evidence=await db!.queryOne<{approval_context:{reviewerPrincipalId:string;lifecycle:{intent:string};recordStatusAfter:string}}>(
      "SELECT approval_context FROM part_approved_change_snapshots WHERE part_id=:id",{id:fixture.partId});
    expect(evidence?.approval_context).toMatchObject({reviewerPrincipalId:"dev122-principal-reviewer",lifecycle:{intent:"first_release"},recordStatusAfter:"Released"});
    readiness=await db!.transaction(tx=>buildTransferPackageReadiness(packageId,"company-jenfu",tx),{readOnly:true});
    expect(readiness.ready,JSON.stringify(readiness.blockers)).toBe(true);
    const submitted=await ok<{requestId:string}>(await submitTransfer(request("/api/transfer-packages/"+packageId+"/submit-review",ownerToken,"POST",
      {expectedRowVersion:readiness.rowVersion,reason:"Normal released Part scope"},1,"","lifecycle-transfer-submit"),params));
    const assigned=await db!.queryOne<{payload_json:{principalReviewer:{principalId:string}}}>(
      "SELECT payload_json FROM approval_platform_requests WHERE id=:id",{id:submitted.requestId});
    expect(JSON.stringify(assigned)).toContain("dev122-principal-reviewer");
    const decisionParams={params:Promise.resolve({requestId:submitted.requestId})};
    const ownerAttempt=await decideTransfer(request("/api/approvals/requests/"+submitted.requestId+"/decisions",ownerToken,"POST",
      {decision:"approved"},1,"","lifecycle-transfer-self-denied"),decisionParams);
    expect([403,404]).toContain(ownerAttempt.status);
    await ok(await decideTransfer(request("/api/approvals/requests/"+submitted.requestId+"/decisions",reviewerToken,"POST",
      {decision:"approved"},1,"","lifecycle-transfer-approved"),decisionParams));
    expect(await db!.queryOne("SELECT package_status FROM transfer_packages WHERE id=:id",{id:packageId})).toMatchObject({package_status:"ApprovedPendingPublish"});
  });
  it("rejects formal baseline drift and rolls back the attempted approval receipt and evidence",async()=>{
    const fixture=await draftReleaseFixture("drift");
    // Explicit disposable fault injection: no lifecycle or grant is seeded.
    await fixtureMutation("P04 concurrent formal payload negative input", "UPDATE part_numbers SET part_name='Concurrent formal change' WHERE id=:id",{id:fixture.partId});
    const id=fixture.submission.data.requestId;
    const result=await decideReview(request("/api/pdm/review-requests/"+id+"/decisions",reviewerToken,"POST",{decision:"approve"},
      fixture.submission.data.rowVersion,await contract("dev122-profile-reviewer")),{params:Promise.resolve({requestId:id})});
    expect(result.status).toBe(409);
    expect(await db!.queryOne("SELECT record_status FROM part_numbers WHERE id=:id",{id:fixture.partId})).toMatchObject({record_status:"Draft"});
    expect(await db!.queryOne("SELECT request_status FROM pdm_work_review_requests WHERE id=:id",{id})).toMatchObject({request_status:"pending"});
    expect(await db!.queryOne("SELECT id FROM part_approved_change_snapshots WHERE part_id=:id",{id:fixture.partId})).toBeNull();
    expect(await db!.queryOne("SELECT id FROM platform_command_receipts WHERE effect_key=:effect AND command_name=:commandName",{effect:"review:"+id,commandName:"dev087:review.decision"})).toBeNull();
  });
  it("rolls back a post-formalize failure and then replays the same request exactly once",async()=>{
    const fixture=await draftReleaseFixture("rollback"),id=fixture.submission.data.requestId;
    const before = await ownedLifecycleSnapshot();
    const original=PartChangeWorkAsyncRepository.prototype.formalize;
    let originalCompleted = false;
    const fault=vi.spyOn(PartChangeWorkAsyncRepository.prototype,"formalize").mockImplementationOnce(async function(this: PartChangeWorkAsyncRepository,tx,input){
      await original.call(this,tx,input);originalCompleted = true;
      throw new Error("DEV122_TASK_OWNED_POST_FORMALIZE_FAULT");
    });
    try{
      const result=await decideReview(request("/api/pdm/review-requests/"+id+"/decisions",reviewerToken,"POST",{decision:"approve"},
        fixture.submission.data.rowVersion,await contract("dev122-profile-reviewer")),{params:Promise.resolve({requestId:id})});
      expect(fault).toHaveBeenCalledTimes(1);
      expect(originalCompleted).toBe(true);
      expect(result.status).toBe(500);
      expect(result.headers.get("cache-control")).toBe("private, no-store");
      const body = await result.json();
      expect(body).toMatchObject({error:{code:"WORKBENCH_INTERNAL_ERROR",message:"操作失敗，請稍後再試"}});
      expect(body.error.correlationId).toMatch(/^[0-9a-f-]{36}$/u);
      expect(JSON.stringify(body)).not.toMatch(/POST_FORMALIZE|SQL|stack/u);
    }finally{fault.mockRestore();}
    expect(await ownedLifecycleSnapshot()).toEqual(before);
    expect(await db!.queryOne("SELECT record_status FROM part_numbers WHERE id=:id",{id:fixture.partId})).toMatchObject({record_status:"Draft"});
    expect(await db!.queryOne("SELECT id FROM part_approved_change_snapshots WHERE part_id=:id",{id:fixture.partId})).toBeNull();
    expect(await db!.queryOne("SELECT id FROM part_change_works WHERE id=:id",{id:fixture.workId})).toBeTruthy();
    await completeReview(fixture.submission,"approve");
    expect(await db!.queryOne("SELECT count(*)::int AS count FROM part_approved_change_snapshots WHERE part_id=:id",{id:fixture.partId})).toMatchObject({count:1});
  });
});

async function uploadNativeProtocolPair(workId: string, label: string) {
  for (const extension of ["SLDDRW", "SLDPRT"]) {
    const params = { params: Promise.resolve({ workId }) };
    const work = await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/" + workId), params));
    const fileName = `${label}.${extension}`;
    const form = new FormData();
    // Only storage/protocol evidence. Actual CAD output is a separate native worker gate.
    form.set("file", new File(["DEV122 protocol fixture " + fileName], fileName, { type: "application/octet-stream" }));
    await ok(await uploadDrawingFile(new Request("https://ai-pdm.test/api/pdm/drawing-revision-works/" + workId + "/files", {
      method: "POST", headers: { cookie: "__session=" + ownerToken, "if-match": String(work.data.rowVersion),
        "x-pdm-workbench-contract": work.meta.contractToken, "idempotency-key": `${workId}-${fileName}` }, body: form
    }), params));
  }
}

async function submitNativeDrawing(workId: string, commandKey = workId + "-submit") {
  const params = { params: Promise.resolve({ workId }) };
  const work = await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/" + workId), params));
  return ok<Submission>(await submitDrawing(request("/api/pdm/drawing-revision-works/" + workId + "/submit", ownerToken, "POST", {},
    work.data.rowVersion, work.meta.contractToken, commandKey), params));
}

async function ownedLifecycleSnapshot() {
  // Parent observes every own table, including migration metadata inaccessible to
  // the business runtime. The result is evidence only, never authorization input.
  const result = await fixtureParentAction("owned-lifecycle-snapshot");
  expect(result.readOnly).toBe(true); expect(result.isolation).toBe("repeatable read");
  expect(result.tableCount).toBe(Object.keys(result.rows).length);
  expect(result.rows).toHaveProperty("contract_manifest");
  expect(result.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
  return result.rows as Record<string, unknown[]>;
}

describe.runIf(enabled && ["ui", "all"].includes(process.env.DEV122_NATIVE_SUITE!))("DEV122 actual Next UI prerequisites", () => {
  it("creates owner work through normal APIs and records explicit terminal-job fault fixtures", async () => {
    const fixtures = [];
    for (const width of [1440, 390]) {
      const label = "UI" + width;
      const part = await ok<{ partNumber: { id: string; partNumber: string } }>(await createRecord(request("/api/numbering/records", ownerToken, "POST",
        { coreName: "DEV122 " + label + " Part", itemKind: "purchased", structureType: "single_part", drawingRequested: false }, 1, "", label + "-part")), 201);
      const started = await ok<{ data: { workId: string } }>(await createPartWork(request("/api/pdm/parts/" + part.partNumber.id + "/change-works", ownerToken, "POST", {},
        1, await contract("dev122-profile-owner"), label + "-part-work"), { params: Promise.resolve({ partId: part.partNumber.id }) }));
      const drawing = await ok<{ drawingNumber: { id: string; drawingNumber: string } }>(await createRecord(request("/api/numbering/records", ownerToken, "POST",
        { coreName: "DEV122 " + label + " Drawing", itemKind: "manufactured", structureType: "single_part", drawingRequested: true, drawingPurposeCode: "M" }, 1, "", label + "-drawing")), 201);
      const work = await db!.queryOne<{ id: string; drawing_id: string }>(`SELECT work.id,work.drawing_id FROM drawing_revision_works work
        JOIN drawings drawing ON drawing.id=work.drawing_id WHERE drawing.formal_drawing_number_id=:id`, { id: drawing.drawingNumber.id });
      expect(work).toBeTruthy(); await uploadNativeProtocolPair(work!.id, label);
      const jobs = await db!.query<{ id: string; source_file_asset_id: string }>(`SELECT job.id,job.source_file_asset_id FROM preview_jobs job JOIN drawing_revision_files file ON file.source_file_asset_id=job.source_file_asset_id
        JOIN drawing_revision_work_files binding ON binding.file_binding_id=file.id WHERE binding.work_id=:workId`, { workId: work!.id });
      expect(jobs.length).toBeGreaterThanOrEqual(2);
      const faultSql = `UPDATE preview_jobs SET status='failed',error_code='dev122_terminal_worker_fault',error_summary='DEV122 task-owned terminal fixture',
        completed_at=:now,updated_at=:now WHERE id=:id`;
      for (const job of jobs) {
        const params = { id: job.id, now: new Date().toISOString() };
        await fs.appendFile(path.join(process.env.DEV122_EVIDENCE_ROOT!, "fixture-mutations.jsonl"), JSON.stringify({
          project: "AIPDM", purpose: "explicit terminal-worker fault input for real mounted UI", scope: "own disposable PG", sql: faultSql, params }) + "\n");
        await db!.execute(faultSql, params);
      }
      fixtures.push({ width, height: width === 1440 ? 900 : 844, partId: part.partNumber.id, partNumber: part.partNumber.partNumber,
        partWorkId: started.data.workId, drawingId: work!.drawing_id, drawingNumber: drawing.drawingNumber.drawingNumber, drawingWorkId: work!.id,
        terminalAssetIds: [...new Set(jobs.map(job=>job.source_file_asset_id))] });
    }
    await fs.writeFile(path.join(process.env.DEV122_RUNTIME_ROOT!, "browser-fixtures.json"), JSON.stringify(fixtures));
    if(process.env.DEV122_RUN_RECOGNITION==="1") {
      const required={PDM_DRAWING_RECOGNITION_V1:"true",PDM_UNIFIED_DRAWING_WORKBENCH_V1:"true",PDM_NUMBER_LIFECYCLE_V2:"true"};
      const prior=Object.fromEntries(Object.keys(required).map(name=>[name,process.env[name]]));Object.assign(process.env,required);
      const inputs=[];
      try {
        for(const input of realCadInputs) {
          const canonical=path.resolve("C:/VIBE CODING/AI_PDM"),originalPath=path.resolve(canonical,input.relative);
          expect(originalPath.startsWith(canonical+path.sep)).toBe(true);const bytes=await fs.readFile(originalPath);
          expect(bytes.length).toBe(input.bytes);expect(createHash("sha256").update(bytes).digest("hex")).toBe(input.hash);
          const file=await normalDrawingFile("recognition-cli-"+input.extension,input.extension,bytes);
          const state=await db!.queryOne<{revision_id:string}>("SELECT revision_id FROM canonical_workbench_states WHERE work_id=:id AND company_id='company-jenfu'",{id:file.workId});
          const created=await ok<{session:{id:string;sourceSetFingerprint:string}}>(await createRecognition(request("/api/numbering/recognition-sessions",ownerToken,"POST",
            {sourceContextType:"drawing_revision",sourceContextId:state!.revision_id,sourceAssetIds:[file.assetId]},1,"","recognition-cli-session-"+input.extension)),201);
          const session=await db!.queryOne("SELECT id,status,not_before,initiator_principal_id,source_set_fingerprint FROM drawing_recognition_sessions WHERE id=:id",{id:created.session.id});
          expect(session).toMatchObject({status:"queued",initiator_principal_id:"dev122-principal-owner",source_set_fingerprint:created.session.sourceSetFingerprint});
          inputs.push({extension:input.extension,originalPath,sourceHash:input.hash,size:input.bytes,workId:file.workId,
            fileAssetId:file.assetId,uploadedPath:file.asset.original_path,session:created.session,sessionReadback:session});
          expect(createHash("sha256").update(await fs.readFile(originalPath)).digest("hex")).toBe(input.hash);
        }
      } finally {for(const name of Object.keys(required)){if(prior[name]===undefined)delete process.env[name];else process.env[name]=prior[name];}}
      await fs.writeFile(path.join(process.env.DEV122_RUNTIME_ROOT!,"recognition-cli-inputs.json"),JSON.stringify(inputs));
      await fs.writeFile(path.join(process.env.DEV122_EVIDENCE_ROOT!,"recognition-cli-normal-input-ledger.json"),JSON.stringify(inputs));
    }
  });
});
