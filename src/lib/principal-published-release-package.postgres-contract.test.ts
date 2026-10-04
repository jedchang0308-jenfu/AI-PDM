import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";

const { evaluatorFailures } = vi.hoisted(() => ({
  evaluatorFailures: [] as Array<{ name: string; code: string | null; column: string | null }>
}));

// Only authenticated-session input is synthetic. Permission evaluation, the
// OrgMaster producer, resource SQL, storage and audit writer remain real.
vi.mock("@/lib/jenfu-principal-request-guard", async (original) => ({
  ...await original<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: async (
    input: { database: AsyncDatabaseClient },
    evaluate: (snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) => Promise<unknown>,
    options: { readOnly?: boolean } = {}
  ) => input.database.transaction(snapshot => evaluate(snapshot, {
    profile: { pdmUserId: "qc-profile-legacy", companyId: "company-jenfu" },
    session: { contractVersion: "jenfu.ai-pdm-session.v2", appId: "ai-pdm",
      sessionId: "dev057-download-session", identityIssuer: "issuer-legacy",
      identitySubject: "subject-legacy", principalId: "principal-legacy",
      employeeId: "employee-legacy", authEpoch: 1, profileVersion: 1,
      issuedAt: "2026-09-29T00:00:00.000Z", expiresAt: "2026-09-30T00:00:00.000Z",
      assuranceLevel: "aal1" }
  }), { readOnly: options.readOnly !== false, isolationLevel: "repeatable_read" }).catch(error => {
    const safe = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_]{1,64}$/u.test(value) ? value : null;
    evaluatorFailures.push({ name: safe(error?.name) ?? "Error", code: safe(error?.code), column: safe(error?.column) });
    throw error;
  })
}));

import { GET as handoff } from "@/app/api/handoff/[id]/release-package/route";
import { GET as procurement } from "@/app/api/integrations/procurement/releases/[id]/package/route";
import { GET as historicalFile } from "@/app/api/submissions/[id]/files/[...filePath]/route";
import { getReleasePackageRoot } from "@/lib/file-storage";
import { GET as shareMetadata } from "@/app/api/submissions/[id]/shares/route";
import { GET as publicShare } from "@/app/api/public/shares/[token]/route";
import { GET as publicSharePackage } from "@/app/api/public/shares/[token]/package/route";
import { withPrincipalSharePermission, getAuthorizedPublicShareInSnapshot } from "@/lib/principal-readonly-share";
import { SELECT_ASYNC_SUPPLIER_PORTAL_RESPONSES_SQL } from "@/lib/repositories/release-async-repository";

const phase = process.env.DEV057_CONTRACT_PHASE;
const dsn = process.env.DEV057_CONTRACT_POSTGRES_URL;
const phases = ["assigned", "revoked", "out-of-scope", "restored", "flow", "file-handoff", "file-revoked", "file-scoped"];
const enabled = Boolean(dsn && phase && phases.includes(phase));
const database = enabled ? getAsyncDatabaseClient() : null;
const bytes = Buffer.from("PK\u0003\u0004 Principal-only released package fixture");
const token = `${Buffer.from(JSON.stringify({ type: "JENFU-AI-PDM-PRINCIPAL", version: 2 })).toString("base64url")}.payload.signature`;
const revoked = ["revoked", "out-of-scope", "file-revoked", "file-scoped"].includes(phase ?? "");
const routes = [{ name: "handoff", get: handoff, code: "handoff.published.view",
  url: (id: string) => `/api/handoff/${id}/release-package`,
  allowed: !revoked && phase === "file-handoff" },
{ name: "procurement", get: procurement, code: "integration.procurement.view",
  url: (id: string) => `/api/integrations/procurement/releases/${id}/package`,
  allowed: !revoked && phase !== "file-handoff" }];
let localPath: string | null = null;
let historicalPath: string | null = null;
const historicalBytes = Buffer.from("%PDF-1.7 task-owned historical drawing fixture");
const historicalAllowed = !revoked && phase !== "file-handoff";
const shareAllowed = historicalAllowed;
// Fixed synthetic selectors belong only to the task-owned database, never Production.
const shareFixtures = [
  { id: "f07-share-active", submissionId: "f07-current", token: "dev057-current-share-token-0001", state: "active" },
  { id: "f07-share-revoked", submissionId: "f07-current", token: "dev057-revoked-share-token-0001", state: "revoked" },
  { id: "f07-share-expired", submissionId: "f07-current", token: "dev057-expired-share-token-0001", state: "expired" },
  { id: "f07-share-foreign", submissionId: "f07-other-company", token: "dev057-foreign-share-token-0001", state: "active" },
  { id: "f07-share-draft", submissionId: "f07-draft", token: "dev057-draft-share-token-000001", state: "active" },
  { id: "f07-share-no-package", submissionId: "f07-no-package", token: "dev057-nopackage-share-token-01", state: "active" }
] as const;
const activeShareToken = shareFixtures[0].token;
const shareCaseEvidence: Array<{ id: string; authorization: "PASS" }> = [];
let publicMetadataBusiness: "NOT_RUN" | "DEFERRED_KNOWN_BUSINESS_SQL_42P08" | "AUTHORIZATION_DENIED" = "NOT_RUN";

beforeAll(async () => {
  if (!enabled || !database || !dsn) return;
  expect(["localhost", "127.0.0.1", "::1"]).toContain(new URL(dsn).hostname);
  const taskRoot = process.env.DEV057_FILE_QC_ROOT;
  if (!taskRoot || !process.env.PDM_DATA_DIR || !process.env.PDM_REPOSITORY_DIR)
    throw new Error("DEV057_FILE_TASK_ROOT_REQUIRED");
  const resolved = path.resolve(taskRoot);
  const temporary = path.resolve(os.tmpdir());
  expect(path.dirname(resolved)).toBe(temporary);
  expect(path.basename(resolved).startsWith("orgmaster-dev057-qc-")).toBe(true);
  expect(new URL(dsn).pathname).toMatch(/^\/dev057_[a-f0-9]{16}$/u);
  expect(path.resolve(process.env.PDM_DATA_DIR)).toBe(path.join(resolved, "aipdm-download-data"));
  expect(path.resolve(process.env.PDM_REPOSITORY_DIR)).toBe(path.join(resolved, "aipdm-download-repository"));
  await fs.access(path.join(resolved, "cluster", "PG_VERSION"));
  const packageRoot = getReleasePackageRoot();
  localPath = path.join(packageRoot, `dev057-f07-${phase}.zip`);
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(localPath, bytes);
  const historicalKey = `dev057-f07-${phase}.pdf`;
  historicalPath = path.join(process.env.PDM_REPOSITORY_DIR, historicalKey);
  await fs.mkdir(process.env.PDM_REPOSITORY_DIR, { recursive: true });
  await fs.writeFile(historicalPath, historicalBytes);
  await database.execute(`INSERT INTO submission_files
    (id,submission_id,original_filename,file_role,local_path,storage_provider,
     storage_key,sha256,file_size) VALUES ('f07-file','f07-current','drawing.pdf','pdf',
      :localPath,'local_repository',:storageKey,:sha256,:size)
    ON CONFLICT(id) DO UPDATE SET local_path=EXCLUDED.local_path,
      storage_key=EXCLUDED.storage_key,sha256=EXCLUDED.sha256,file_size=EXCLUDED.file_size`,
  { localPath: historicalPath, storageKey: historicalKey,
    sha256: createHash("sha256").update(historicalBytes).digest("hex"), size: historicalBytes.byteLength });
  await database.execute(`INSERT INTO release_packages
    (id,submission_id,package_filename,local_path,storage_provider,storage_key,
     sha256,file_size,manifest_json,created_by,created_at)
    VALUES ('f07-package','f07-current','f07-package.zip',:localPath,
      'local_repository',:storageKey,:sha256,:size,'{}','qc-profile-legacy',now())
    ON CONFLICT(id) DO UPDATE SET local_path=EXCLUDED.local_path,
      storage_key=EXCLUDED.storage_key,sha256=EXCLUDED.sha256,file_size=EXCLUDED.file_size`,
  { localPath, storageKey: `dev057-f07-${phase}.zip`,
    sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.byteLength });
  for (const share of shareFixtures) await database.execute(
    `INSERT INTO readonly_shares
      (id,submission_id,token_hash,label,expires_at,revoked_at,revoked_by,
       created_by,access_count,created_at,updated_at)
      VALUES (:id,:submissionId,:tokenHash,'Task-owned share',:expiresAt,
        :revokedAt,:revokedBy,'qc-profile-legacy',0,now(),now())
      ON CONFLICT(id) DO NOTHING`,
    { id: share.id, submissionId: share.submissionId,
      tokenHash: createHash("sha256").update(share.token).digest("hex"),
      expiresAt: share.state === "expired" ? "2000-01-01T00:00:00Z" : "2099-01-01T00:00:00Z",
      revokedAt: share.state === "revoked" ? "2026-01-01T00:00:00Z" : null,
      revokedBy: share.state === "revoked" ? "qc-profile-legacy" : null });
});
afterAll(async () => {
  if (enabled) process.stdout.write(JSON.stringify({ dev057ShareReadConformance: {
    phase, status: shareCaseEvidence.length === 6 ? "PASS_AUTHORIZATION_ONLY" : "INCOMPLETE",
    cases: shareCaseEvidence, publicMetadataBusiness, publicMetadataPositivePass: false,
    businessKnownBlocked: { id: "D122-08", code: "42P08",
      querySha256: createHash("sha256").update(SELECT_ASYNC_SUPPLIER_PORTAL_RESPONSES_SQL).digest("hex"),
      status: "DEFERRED_NOT_PASS" },
    syntheticVerifiedSession: true, syntheticBusinessSchema: true, syntheticStorageBytes: true,
    actualOrg029Producer: true, actualShareResolverAndDelivery: true,
    providerConformance: false, productionL4: false
  } }) + "\n");
  try { await database?.close(); } finally {
  if (localPath) await fs.rm(localPath, { force: true });
  if (historicalPath) await fs.rm(historicalPath, { force: true });
} });
const invoke = (route: typeof routes[number], id = "f07-current", authenticated = true) =>
  route.get(new Request("https://ai-pdm.test" + route.url(id), {
    headers: authenticated ? { cookie: `pdm_session=${token}` } : {}
  }), { params: Promise.resolve({ id }) });
const invokeHistorical = (id = "f07-current", filePath = ["f07-file"], authenticated = true) =>
  historicalFile(new Request("https://ai-pdm.test/api/submissions/" + id + "/files/" + filePath.join("/"), {
    headers: authenticated ? { cookie: `pdm_session=${token}` } : {}
  }), { params: Promise.resolve({ id, filePath }) });
const invokeShareMetadata = (id = "f07-current", authenticated = true) =>
  shareMetadata(new Request("https://ai-pdm.test/api/submissions/" + id + "/shares", {
    headers: authenticated ? { cookie: `pdm_session=${token}` } : {}
  }), { params: Promise.resolve({ id }) });
const invokePublicShare = (get: typeof publicShare | typeof publicSharePackage,
  selector: string = activeShareToken, authenticated = true) =>
  get(new Request("https://ai-pdm.test/api/public/shares/" + encodeURIComponent(selector) +
    (get === publicSharePackage ? "/package" : ""), {
    headers: authenticated ? { cookie: `pdm_session=${token}` } : {}
  }), { params: Promise.resolve({ token: selector }) });
async function shareAccessCount() {
  return (await database!.queryOne<{ count: number }>(
    "SELECT coalesce(sum(access_count),0)::integer AS count FROM readonly_shares"))!.count;
}
async function auditCount() {
  return (await database!.queryOne<{ count: number }>(
    "SELECT count(*)::integer AS count FROM audit_logs"))!.count;
}

describe.runIf(enabled)("OrgMaster published grant → Principal package HTTP → PostgreSQL audit and actual bytes", () => {
  it.each(routes)("enforces the owner-published $code before delivering bytes", async route => {
    if (!database) throw new Error("TASK_OWNED_POSTGRES_REQUIRED");
    const before = await auditCount();
    const response = await invoke(route);
    expect(response.status).toBe(route.allowed ? 200 : 403);
    if (route.allowed) {
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
      expect(response.headers.get("content-type")).toBe("application/zip");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("content-length")).toBe(String(bytes.byteLength));
      const audit = await database.queryOne<{ actor_id: string; company_id: string; detail_json: string }>(
        "SELECT actor_id,company_id,detail_json FROM audit_logs ORDER BY created_at DESC LIMIT 1");
      expect(audit?.actor_id).toBe("principal-legacy");
      expect(audit?.company_id).toBe("company-jenfu");
      expect(JSON.parse(audit!.detail_json)).toMatchObject({ securityPrincipalId: "principal-legacy",
        historicalProfileId: "qc-profile-legacy", bytes: bytes.byteLength,
        accessKind: "release_package", route: route.url("[id]") });
      expect(await auditCount()).toBe(before + 1);
    } else {
      expect(await response.text()).not.toContain(bytes.toString());
      expect(await auditCount()).toBe(before);
    }
  });
  it("denies other-company, draft, superseded and absent packages without file delivery or audit", async () => {
    const route = routes.find(item => item.allowed) ?? routes[0];
    const before = await auditCount();
    for (const id of ["f07-other-company", "f07-draft", "f07-old", "f07-no-package"])
      expect((await invoke(route, id)).status).toBe(route.allowed ? 404 : 403);
    expect(await auditCount()).toBe(before);
  });
  it("rejects changed storage bytes without issuing access audit", async () => {
    const route = routes.find(item => item.allowed) ?? routes[0];
    if (!localPath) throw new Error("TASK_OWNED_PACKAGE_REQUIRED");
    const before = await auditCount();
    await fs.writeFile(localPath, Buffer.from("tampered package"));
    try { expect((await invoke(route)).status).toBe(route.allowed ? 503 : 403); }
    finally { await fs.writeFile(localPath, bytes); }
    expect(await auditCount()).toBe(before);
  });
  it("rejects an absent Principal session without reading or auditing packages", async () => {
    const before = await auditCount();
    for (const route of routes) expect((await invoke(route, "f07-current", false)).status).toBe(401);
    expect(await auditCount()).toBe(before);
  });

  it.each(["attachment", "inline"] as const)("reads historical %s bytes with the published Principal grant", async disposition => {
    if (!database) throw new Error("TASK_OWNED_POSTGRES_REQUIRED");
    const before = await auditCount();
    const response = await invokeHistorical("f07-current", disposition === "inline" ? ["preview", "f07-file"] : ["f07-file"]);
    expect(response.status).toBe(historicalAllowed ? 200 : 403);
    if (historicalAllowed) {
      expect(Buffer.from(await response.arrayBuffer())).toEqual(historicalBytes);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toContain(disposition);
      const audit = await database.queryOne<{ actor_id: string; company_id: string; detail_json: string }>(
        "SELECT actor_id,company_id,detail_json FROM audit_logs ORDER BY created_at DESC LIMIT 1");
      expect(audit?.actor_id).toBe("principal-legacy");
      expect(audit?.company_id).toBe("company-jenfu");
      expect(JSON.parse(audit!.detail_json)).toMatchObject({ securityPrincipalId: "principal-legacy",
        historicalProfileId: "qc-profile-legacy", fileId: "f07-file", bytes: historicalBytes.byteLength,
        accessKind: disposition === "inline" ? "submission_file_preview" : "submission_file" });
    }
    expect(await auditCount()).toBe(before + (historicalAllowed ? 1 : 0));
  });
  it("binds historical files to the authorized company and submission", async () => {
    const before = await auditCount();
    for (const [id, filePath] of [["f07-other-company", ["f07-file"]],
      ["f07-draft", ["f07-file"]], ["f07-current", ["missing-file"]]] as const) {
      expect((await invokeHistorical(id, [...filePath])).status).toBe(historicalAllowed ? 404 : 403);
    }
    expect((await invokeHistorical("f07-current", ["f07-file"], false)).status).toBe(401);
    expect((await invokeHistorical("f07-current", ["invalid", "path", "format"])).status).toBe(404);
    expect(await auditCount()).toBe(before);
  });
  it("refuses tampered or missing historical storage without audit", async () => {
    if (!historicalPath) throw new Error("TASK_OWNED_HISTORICAL_FILE_REQUIRED");
    const before = await auditCount();
    await fs.writeFile(historicalPath, Buffer.from("tampered drawing"));
    try { expect((await invokeHistorical()).status).toBe(historicalAllowed ? 503 : 403); }
    finally { await fs.writeFile(historicalPath, historicalBytes); }
    const hiddenPath = historicalPath + ".missing";
    await fs.rename(historicalPath, hiddenPath);
    try { expect((await invokeHistorical()).status).toBe(historicalAllowed ? 404 : 403); }
    finally { await fs.rename(hiddenPath, historicalPath); }
    expect(await auditCount()).toBe(before);
  });
  it("reads share metadata through the actual published capability without disclosing token hashes", async () => {
    const before = await auditCount();
    const accessBefore = await shareAccessCount();
    const response = await invokeShareMetadata();
    expect(response.status).toBe(shareAllowed ? 200 : 403);
    if (shareAllowed) {
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const body = await response.json();
      expect(body.shares).toHaveLength(3);
      expect(body.shares.map((share: { status: string }) => share.status).sort())
        .toEqual(["active", "expired", "revoked"]);
      expect(JSON.stringify(body)).not.toContain("token_hash");
      for (const share of shareFixtures) expect(JSON.stringify(body)).not.toContain(share.token);
      expect((await invokeShareMetadata("f07-other-company")).status).toBe(404);
    }
    expect(await auditCount()).toBe(before);
    expect(await shareAccessCount()).toBe(accessBefore);
    shareCaseEvidence.push({ id: "SREAD-01", authorization: "PASS" });
  });
  it("separates actual share authorization from the deferred metadata serializer failure", async () => {
    const before = await auditCount();
    const accessBefore = await shareAccessCount();
    const request = new Request("https://ai-pdm.test/api/public/shares/" + activeShareToken, {
      headers: { cookie: `pdm_session=${token}` } });
    // This is the actual route wrapper and resolver, with its actual PostgreSQL
    // grant/resource/access update; only the downstream business serializer is omitted.
    const resolved = await withPrincipalSharePermission(request,
      "src/app/api/public/shares/[token]/route.ts", "submission.view",
      ({ snapshot, verified }) => getAuthorizedPublicShareInSnapshot(snapshot, verified, activeShareToken),
      { readOnly: false });
    if (shareAllowed) {
      expect(resolved).not.toBeInstanceOf(Response);
      if (resolved instanceof Response) throw new Error("ACTUAL_AUTHORIZATION_NOT_ALLOWED");
      expect(resolved.share.id).toBe("f07-share-active");
      expect(resolved.submission).toMatchObject({ id: "f07-current", company_id: "company-jenfu", status: "Released" });
      expect(Number(resolved.submission.release_package!.file_size)).toBe(bytes.byteLength);
    } else {
      expect(resolved).toBeInstanceOf(Response);
      expect((resolved as Response).status).toBe(403);
    }
    const failuresBefore = evaluatorFailures.length;
    const response = await invokePublicShare(publicShare);
    expect(response.status, JSON.stringify(evaluatorFailures)).toBe(shareAllowed ? 503 : 403);
    if (shareAllowed) {
      expect(evaluatorFailures.slice(failuresBefore)).toEqual([{ name: "error", code: "42P08", column: null }]);
      expect(await response.json()).toMatchObject({ code: "principal_dependency_unavailable" });
      publicMetadataBusiness = "DEFERRED_KNOWN_BUSINESS_SQL_42P08";
    } else {
      const expectedCode = ["revoked", "file-revoked"].includes(phase ?? "")
        ? "entitlement_assignment_not_found"
        : phase === "out-of-scope"
          ? "entitlement_scope_mismatch" : "permission_not_granted";
      expect(await response.json()).toMatchObject({ error: expectedCode });
      // Missing current grants are an actual typed repository denial, not a DB fault.
      expect(evaluatorFailures.slice(failuresBefore).every(error => error.code === expectedCode)).toBe(true);
      publicMetadataBusiness = "AUTHORIZATION_DENIED";
    }
    // The real public metadata transaction fails and rolls back its access update.
    // Only the separate, authorized resource probe above commits its one access.
    expect(await shareAccessCount()).toBe(accessBefore + (shareAllowed ? 1 : 0));
    expect(await auditCount()).toBe(before);
    shareCaseEvidence.push({ id: "SREAD-02", authorization: "PASS" });
  });
  it("delivers actual share package bytes with persisted canonical Principal download audit", async () => {
    const before = await auditCount();
    const accessBefore = await shareAccessCount();
    const response = await invokePublicShare(publicSharePackage);
    expect(response.status).toBe(shareAllowed ? 200 : 403);
    if (shareAllowed) {
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
      expect(response.headers.get("content-type")).toBe("application/zip");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const audit = await database!.queryOne<{ actor_id: string; company_id: string; submission_id: string;
        scope_kind: string; action: string; detail_json: string }>(
        "SELECT actor_id,company_id,submission_id,scope_kind,action,detail_json FROM audit_logs ORDER BY created_at DESC LIMIT 1");
      expect(audit).toMatchObject({ actor_id: "principal-legacy", company_id: "company-jenfu",
        submission_id: "f07-current", scope_kind: "tenant", action: "StorageAccessed" });
      const detail = JSON.parse(audit!.detail_json);
      expect(detail).toMatchObject({ securityPrincipalId: "principal-legacy",
        historicalProfileId: "qc-profile-legacy", shareId: "f07-share-active", fileId: "f07-package",
        bytes: bytes.byteLength, accessKind: "public_share_package", externalAccess: true,
        route: "/api/public/shares/[token]/package" });
      expect(JSON.stringify(detail)).not.toContain(activeShareToken);
      expect(JSON.stringify(detail)).not.toContain(createHash("sha256").update(activeShareToken).digest("hex"));
    }
    expect(await shareAccessCount()).toBe(accessBefore + (shareAllowed ? 1 : 0));
    expect(await auditCount()).toBe(before + (shareAllowed ? 1 : 0));
    shareCaseEvidence.push({ id: "SREAD-03", authorization: "PASS" });
  });
  it("rejects invalid, expired, revoked, foreign-company and unavailable share resources without effects", async () => {
    const before = await auditCount();
    const accessBefore = await shareAccessCount();
    for (const get of [publicShare, publicSharePackage]) {
      for (const selector of ["invalid", "dev057-unknown-share-token-001",
        shareFixtures[1].token, shareFixtures[2].token]) {
        const response = await invokePublicShare(get, selector);
        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain(bytes.toString());
      }
      for (const share of shareFixtures.slice(3))
        expect((await invokePublicShare(get, share.token)).status).toBe(shareAllowed ? 404 : 403);
    }
    expect(await shareAccessCount()).toBe(accessBefore);
    expect(await auditCount()).toBe(before);
    shareCaseEvidence.push({ id: "SREAD-04", authorization: "PASS" });
  });
  it("requires a Principal session for share metadata and package selectors before any effects", async () => {
    const before = await auditCount();
    const accessBefore = await shareAccessCount();
    expect((await invokeShareMetadata("f07-current", false)).status).toBe(401);
    for (const get of [publicShare, publicSharePackage])
      expect((await invokePublicShare(get, activeShareToken, false)).status).toBe(401);
    expect(await shareAccessCount()).toBe(accessBefore);
    expect(await auditCount()).toBe(before);
    shareCaseEvidence.push({ id: "SREAD-05", authorization: "PASS" });
  });
  it("withholds tampered share package bytes and successful download audit", async () => {
    if (!localPath) throw new Error("TASK_OWNED_PACKAGE_REQUIRED");
    const before = await auditCount();
    await fs.writeFile(localPath, Buffer.from("tampered share package"));
    try { expect((await invokePublicShare(publicSharePackage)).status).toBe(shareAllowed ? 503 : 403); }
    finally { await fs.writeFile(localPath, bytes); }
    // Access lookup is its own committed transaction; it is not a successful download audit.
    expect(await auditCount()).toBe(before);
    shareCaseEvidence.push({ id: "SREAD-06", authorization: "PASS" });
  });

});
