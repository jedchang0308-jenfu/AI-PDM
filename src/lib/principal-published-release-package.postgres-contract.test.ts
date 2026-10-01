import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";

// Only authenticated-session input is synthetic. Permission evaluation, the
// OrgMaster producer, resource SQL, storage and audit writer remain real.
vi.mock("@/lib/jenfu-principal-request-guard", async (original) => ({
  ...await original<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: async (
    input: { database: AsyncDatabaseClient },
    evaluate: (snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) => Promise<unknown>
  ) => input.database.transaction(snapshot => evaluate(snapshot, {
    profile: { pdmUserId: "qc-profile-legacy", companyId: "company-jenfu" },
    session: { contractVersion: "jenfu.ai-pdm-session.v2", appId: "ai-pdm",
      sessionId: "dev057-download-session", identityIssuer: "issuer-legacy",
      identitySubject: "subject-legacy", principalId: "principal-legacy",
      employeeId: "employee-legacy", authEpoch: 1, profileVersion: 1,
      issuedAt: "2026-09-29T00:00:00.000Z", expiresAt: "2026-09-30T00:00:00.000Z",
      assuranceLevel: "aal1" }
  }), { readOnly: true, isolationLevel: "repeatable_read" })
}));

import { GET as handoff } from "@/app/api/handoff/[id]/release-package/route";
import { GET as procurement } from "@/app/api/integrations/procurement/releases/[id]/package/route";
import { GET as historicalFile } from "@/app/api/submissions/[id]/files/[...filePath]/route";
import { getReleasePackageRoot } from "@/lib/file-storage";

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
});
afterAll(async () => { try { await database?.close(); } finally {
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
});
