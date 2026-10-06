import crypto from "node:crypto";
import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as claim } from "@/app/api/openswx-metadata-jobs/claim/route";
import { GET as humanGet, POST as humanPost } from "@/app/api/numbering/openswx-metadata/[sourceContextType]/[sourceContextId]/route";
import { POST as humanCancel } from "@/app/api/numbering/openswx-metadata/[sourceContextType]/[sourceContextId]/cancel/route";
import { OpenSwxJobProvider } from "./openswx-metadata-dispatch";
import { readOpenSwxContent, readOpenSwxJson, OpenSwxMetadataService } from "./openswx-metadata";
import { normalizeOpenSwxResult, OPENSWX_READER, type OpenSwxFence } from "./openswx-metadata-contract";
import type { AsyncDatabaseClient } from "./db-async-provider";
import type { FileStorageService } from "./file-storage";
import type { VerifiedWorkloadActor } from "./worker-service-auth";
import * as companyWrite from "./principal-company-read";
import type { OpenSwxJob } from "./repositories/openswx-metadata-async-repository";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const token = "x".repeat(43);
function registry() { vi.stubEnv("PDM_WORKLOAD_AUTH_CREDENTIALS", JSON.stringify({ schemaVersion: "ai-pdm.workload-credentials.v1", workloads: [{ id: OPENSWX_READER.id, token, purposes: ["openswx_metadata_jobs"], capabilities: ["openswx_metadata"] }] })); }
describe("OpenSWX HTTP protocol and verified bearer denial (no auth success fixture)", () => {
  it("run-only completed duplicate enqueue/cancel responses are status-only (guard/control seam, not native Principal proof)", async () => {
    const completed = { id: "duplicate", status: "completed", dispatchState: "terminal", attemptCount: 1, heartbeatAt: null, leaseExpiresAt: null, readerCommit: OPENSWX_READER.commit, sourceSetFingerprint: "a".repeat(64), resultJson: JSON.stringify({ results: [{ privateCadProperty: "MUST_NOT_RETURN" }] }) } as OpenSwxJob;
    vi.spyOn(companyWrite, "withPrincipalCompanyWrite").mockImplementation(async (_request, _route, permission, callback) => {
      expect(permission).toBe("numbering.recognition.run");
      return callback({} as never, {} as never, {} as never);
    });
    vi.spyOn(OpenSwxMetadataService.prototype, "enqueue").mockResolvedValue(completed);
    vi.spyOn(OpenSwxMetadataService.prototype, "cancelContext").mockResolvedValue(completed);
    const context = { params: Promise.resolve({ sourceContextType: "drawing_number", sourceContextId: "context" }) };
    for (const handler of [humanPost, humanCancel]) {
      const response = await handler(new Request("https://ai-pdm.test/api/numbering/openswx-metadata/drawing_number/context", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceAssetIds: ["asset"] }) }), context);
      const body = await response.json(); expect(body.job.id).toBe("duplicate"); expect(body.job.status).toBe("completed");
      expect(Object.keys(body.job).sort()).toEqual(["attempt", "dispatchState", "heartbeatAt", "id", "leaseExpiresAt", "status"].sort());
      expect(JSON.stringify(body)).not.toMatch(/MUST_NOT_RETURN|result|properties|sourceSetFingerprint/u);
    }
  });
  it("all four human context methods use actual missing-Principal denial and never invoke provider", async () => {
    const provider = vi.spyOn(OpenSwxJobProvider.prototype, "run").mockRejectedValue(Error("forbidden-provider"));
    for (const type of ["drawing_number", "drawing_revision", "revision_package", "candidate_revision"]) {
      const context = { params: Promise.resolve({ sourceContextType: type, sourceContextId: "context" }) }, url = `https://ai-pdm.test/api/numbering/openswx-metadata/${type}/context`;
      expect((await humanGet(new Request(url + "?sourceAssetId=asset"), context)).status).toBe(401);
      for (const [handler, path] of [[humanPost, url], [humanCancel, url + "/cancel"]] as const) expect((await handler(new Request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceAssetIds: ["asset"] }) }), context)).status).toBe(401);
    }
    expect(provider).not.toHaveBeenCalled();
    // Authorized route control flow is also statically closed to enqueue/read/cancel only;
    // root's lawful native Principal session fixture supplies the separate successful auth proof.
    for (const path of ["src/app/api/numbering/openswx-metadata/[sourceContextType]/[sourceContextId]/route.ts", "src/app/api/numbering/openswx-metadata/[sourceContextType]/[sourceContextId]/cancel/route.ts"]) expect(fs.readFileSync(path, "utf8")).not.toMatch(/recoverOpenSwxDispatch|new OpenSwxJobProvider|\.run\(/u);
  });
  it("human body/query never supplies company/job admission authority", async () => {
    const url = "https://ai-pdm.test/api/numbering/openswx-metadata/drawing_number/context", context = { params: Promise.resolve({ sourceContextType: "drawing_number", sourceContextId: "context" }) };
    expect((await humanGet(new Request(url + "?sourceAssetId=asset&companyId=foreign"), context)).status).toBe(400);
    expect((await humanPost(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceAssetIds: ["asset"], companyId: "foreign", jobId: "foreign" }) }), context)).status).toBe(400);
  });
  it("actual registry denies foreign token before any database call", async () => {
    registry(); const response = await claim(new Request("https://ai-pdm.test/api/openswx-metadata-jobs/claim", { method: "POST", headers: { authorization: `Bearer ${"y".repeat(43)}`, "content-type": "application/json" }, body: "{}" }));
    expect(response.status).toBe(403); expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("reader HTTP body cannot select company or another job admission", async () => {
    registry();
    const response = await claim(new Request("https://ai-pdm.test/api/openswx-metadata-jobs/claim", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ executionName: "projects/9536592944/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata/executions/local", companyId: "foreign", jobId: "foreign" }) }));
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ code: "OPENSWX_BODY_INVALID" });
    expect(fs.existsSync("C:/VIBE CODING/AI_PDM/data/ai-pdm.sqlite")).toBe(false);
    expect(fs.existsSync("C:/Users/user/.codex/worktrees/dev122-internal-functions/AI_PDM/data/ai-pdm.sqlite")).toBe(false);
  });
  it("actual chunk bytes enforce body bound and strict UTF8 without truncation", async () => {
    await expect(readOpenSwxJson(new Request("https://ai-pdm.test/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ results: "x".repeat(100) }) }), ["results"], 10)).rejects.toThrow("OPENSWX_BODY_LIMIT");
    await expect(readOpenSwxJson(new Request("https://ai-pdm.test/", { method: "POST", headers: { "content-type": "application/json" }, body: new Uint8Array([255]) }), [])).rejects.toThrow("OPENSWX_BODY_INVALID");
  });
  it("aborted body wait cancels its own stalled stream before dispatch", async () => {
    let cancelled = 0; const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled++; } });
    const request = new Request("https://ai-pdm.test/", { method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half" } as RequestInit);
    const timer = setTimeout(() => controller.abort(), 10);
    try { await expect(readOpenSwxJson(request, [], 100, controller.signal)).rejects.toThrow("OPENSWX_REQUEST_ABORTED"); expect(cancelled).toBe(1); }
    finally { clearTimeout(timer); }
  });
  it("runner auxiliary normalizer is byte-identical to server's deterministic digest source", async () => {
    const normalizerPath = "../../scripts/lib/openswx-reader/normalize.mjs";
    const { normalizeAuxiliary } = await import(normalizerPath) as { normalizeAuxiliary: typeof normalizeOpenSwxResult };
    const source = { id: "s", fileAssetId: "a", sha256: "a".repeat(64), bytes: 12, extension: "sldprt", storageGeneration: null };
    for (const payload of [{ schemaVersion: "aipdm.openswx-public-api.v1", status: "opened", documentType: "part", version: 10, sheetCount: 0, globalProperties: { z: "", a: "本體" }, configurations: [{ index: 1, name: "有效合併", effectiveProperties: { z: "1", a: "2" } }] }, { schemaVersion: "aipdm.openswx-public-api.v1", status: "failed", diagnostics: ["library_open_rejected"] }]) expect(JSON.stringify(normalizeAuxiliary(payload, source))).toBe(JSON.stringify(normalizeOpenSwxResult(payload, source)));
  });
});
describe("OpenSWX storage boundary before/after read (declared authority seam, not native API proof)", () => {
  it("rechecks lease/cancel/current source after bytes read and returns no pointer", async () => {
    const bytes = Buffer.from("fixture"), hash = crypto.createHash("sha256").update(bytes).digest("hex");
    const source = { id: "source", fileAssetId: "asset", sha256: hash, bytes: bytes.length, extension: "sldprt", storageGeneration: "1" };
    const actor: VerifiedWorkloadActor = { kind: "workload", id: OPENSWX_READER.id, purposes: ["openswx_metadata_jobs"], capabilities: ["openswx_metadata"] };
    const fence: OpenSwxFence = { jobId: "job", companyId: "company", attempt: 1, sourceSetFingerprint: hash, readerCommit: OPENSWX_READER.commit, executionName: "execution" };
    let revoked = false, checks = 0;
    const service = { authorizeSource: async () => { checks++; if (revoked) throw Error("lease-revoked"); return source; } } as unknown as OpenSwxMetadataService;
    const db = { queryOne: async () => ({ content_hash: hash, file_size: bytes.length, storage_provider: "google_cloud_storage", storage_bucket: "fixture-own", storage_key: "fixture", storage_generation: "1", local_path: null }) } as unknown as AsyncDatabaseClient;
    const storage = { getObjectMetadata: async () => ({ bytes: bytes.length, generation: "1" }), readObject: async () => bytes } as unknown as FileStorageService;
    expect(await readOpenSwxContent(db, service, actor, fence, "source", () => storage)).toEqual({ bytes, sha256: hash }); expect(checks).toBe(2);
    const cancelRace = { ...storage, readObject: async () => { revoked = true; return bytes; } };
    await expect(readOpenSwxContent(db, service, actor, fence, "source", () => cancelRace)).rejects.toThrow("lease-revoked");
    for (const event of ["cancel", "revoke", "membership-remove"]) {
      revoked = false; let pointers = 0;
      const finalPointerRace = { queryOne: async () => { pointers++; if (pointers === 2) revoked = true; return db.queryOne(""); } } as unknown as AsyncDatabaseClient;
      await expect(readOpenSwxContent(finalPointerRace, service, actor, fence, "source", () => storage), event).rejects.toThrow("lease-revoked");
      expect(pointers).toBe(2);
    }
  });
  it("metadata mismatch rejects before readObject", async () => {
    const source = { id: "source", fileAssetId: "asset", sha256: "a".repeat(64), bytes: 12, extension: "sldprt", storageGeneration: "1" };
    const service = { authorizeSource: async () => source } as unknown as OpenSwxMetadataService;
    const db = { queryOne: async () => ({ content_hash: source.sha256, file_size: 12, storage_provider: "google_cloud_storage", storage_bucket: "fixture-own", storage_key: "fixture", storage_generation: "1" }) } as unknown as AsyncDatabaseClient;
    let reads = 0;
    const storage = { getObjectMetadata: async () => ({ bytes: 13, generation: "1" }), readObject: async () => { reads++; return Buffer.alloc(13); } } as unknown as FileStorageService;
    await expect(readOpenSwxContent(db, service, {} as VerifiedWorkloadActor, { jobId: "job", companyId: "company" } as OpenSwxFence, "source", () => storage)).rejects.toThrow("OPENSWX_SOURCE_DRIFT"); expect(reads).toBe(0);
  });
});
