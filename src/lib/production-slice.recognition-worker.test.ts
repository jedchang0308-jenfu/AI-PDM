import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { POST as claim } from "@/app/api/recognition-jobs/claim/route";
import { POST as heartbeat } from "@/app/api/recognition-jobs/[sessionId]/heartbeat/route";
import { POST as complete } from "@/app/api/recognition-jobs/[sessionId]/complete/route";

const mocks = vi.hoisted(() => ({ claim: vi.fn(), heartbeat: vi.fn(), complete: vi.fn(), queryOne: vi.fn() }));
vi.mock("@/lib/drawing-recognition", () => ({
  claimDrawingRecognitionJob: mocks.claim,
  heartbeatDrawingRecognitionJob: mocks.heartbeat,
  completeDrawingRecognitionJob: mocks.complete
}));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: () => ({ kind: "postgres", queryOne: mocks.queryOne }) }));

const sessionId = "recognition-fixture";
const deviceId = "recognition-device-fixture";
const instanceId = "instance-one";
const workerId = `${deviceId}:${instanceId}`;
const token = Buffer.alloc(32, 41).toString("base64url");
const credentialHash = crypto.createHash("sha256").update(token).digest("hex");
const lockedAt = "2026-10-23T00:00:00.000Z";
const leaseBasis = { companyId: "company-one", sourceSetFingerprint: "fixture-fingerprint", attemptCount: 1, lockedAt };
const paths = ["/api/recognition-jobs/claim", `/api/recognition-jobs/${sessionId}/heartbeat`,
  `/api/recognition-jobs/${sessionId}/complete`] as const;

const deviceRow = { id: deviceId, company_id: "company-one", name: "Recognition worker", credential_hash: credentialHash,
  status: "active", instance_id: instanceId, service_version: "test", protocol_version: 1,
  registered_by: "profile-one", registered_at: lockedAt, last_seen_at: lockedAt,
  revoked_at: null, revoked_by: null, row_version: 1 };

function body(path: string, worker = workerId) {
  if (path === paths[0]) return { workerId: worker, maxAttempts: 2, allowNativeSources: true };
  if (path === paths[1]) return { workerId: worker, leaseProtocolVersion: 1, leaseBasis };
  return { workerId: worker, leaseProtocolVersion: 1, leaseBasis, results: [] };
}
function request(path: string, authorization = `Bearer ${token}`, value: unknown = body(path)) {
  return new NextRequest(`https://pdm.example${path}`, { method: "POST",
    headers: { "content-type": "application/json", "x-pdm-worker-id": workerId,
      ...(authorization ? { authorization } : {}) }, body: JSON.stringify(value) });
}
async function dispatch(path: string, incoming = request(path)) {
  const gate = middleware(incoming);
  if (gate.headers.get("x-middleware-next") !== "1") return gate;
  const context = { params: Promise.resolve({ sessionId }) };
  if (path === paths[0]) return claim(incoming);
  return path === paths[1] ? heartbeat(incoming, context) : complete(incoming, context);
}
function expectNoCommand() { for (const command of [mocks.claim, mocks.heartbeat, mocks.complete]) expect(command).not.toHaveBeenCalled(); }

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", "official-numbering-draft");
  mocks.queryOne.mockResolvedValue(deviceRow);
  mocks.claim.mockResolvedValue({ sessionId, companyId: "company-one", sourceSetFingerprint: leaseBasis.sourceSetFingerprint,
    attemptCount: 1, lockedAt });
  mocks.complete.mockResolvedValue({ id: sessionId, status: "review_ready" });
});
afterEach(() => vi.unstubAllEnvs());

describe("recognition worker dispatch retains the current device boundary", () => {
  it.each(paths)("dispatches exact POST %s through middleware, database device auth and route", async path => {
    const response = await dispatch(path); expect(response.status).toBe(200);
    const selected = path === paths[0] ? mocks.claim : path === paths[1] ? mocks.heartbeat : mocks.complete;
    expect(selected).toHaveBeenCalledOnce();
    expect(selected).toHaveBeenCalledWith(path === paths[0]
      ? { workerId, companyId: "company-one", maxAttempts: 2, allowNativeSources: true }
      : path === paths[1] ? { sessionId, workerId, leaseBasis }
      : { sessionId, workerId, leaseBasis, results: [] });
    expect(mocks.queryOne).toHaveBeenCalledWith(expect.stringContaining("windows_service_devices"), { credentialHash });
  });

  it.each(paths)("keeps %s blocked in an unknown production slice", async path => {
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", "unknown-mode");
    const response = await dispatch(path); expect(response.status).toBe(403);
    expect(response.headers.get("x-ai-pdm-production-slice")).toBe("unknown-mode"); expectNoCommand();
  });

  it.each(paths)("keeps non-POST mutations closed for %s", path => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect(middleware(new NextRequest(`https://pdm.example${path}`, { method })).status).toBe(403);
    }
    expectNoCommand();
  });

  it.each(["/api/recognition-jobs", "/api/recognition-jobs/claim/extra", "/api/recognition-jobs/heartbeat",
    "/api/recognition-jobs/complete", `/api/recognition-jobs/${sessionId}/heartbeat/extra`,
    `/api/recognition-jobs/${sessionId}/complete/extra`, `/api/recognition-jobs/${sessionId}/cancel`,
    `/api/recognition-jobs/${sessionId}/requeue`, `/api/recognition-jobs/${sessionId}/sources/source-one/content`,
    "/api/recognition-jobs-extra/claim", "/api/preview-jobs-extra/claim"])("keeps unlisted worker mutation %s closed", path => {
      expect(middleware(request(path)).status).toBe(403); expectNoCommand();
    });

  it.each(paths)("rejects missing credentials and a human session at %s without commands", async path => {
    const incoming = request(path, ""); incoming.headers.set("cookie", "pdm_session=synthetic-human-session");
    const response = await dispatch(path, incoming); expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "WORKER_DEVICE_UNAUTHORIZED" }); expectNoCommand();
  });

  it.each(paths)("rejects a revoked current device at %s without commands", async path => {
    mocks.queryOne.mockResolvedValue(null); const response = await dispatch(path);
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: "WORKER_DEVICE_UNAUTHORIZED" });
    expectNoCommand();
  });

  it.each(paths)("rejects a spoofed body worker at %s without commands", async path => {
    const response = await dispatch(path, request(path, `Bearer ${token}`, body(path, "principal-other")));
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: "WORKLOAD_ID_MISMATCH" });
    expectNoCommand();
  });

  it.each(paths)("fails closed when the device directory is unavailable at %s", async path => {
    mocks.queryOne.mockRejectedValue(new Error("synthetic database unavailable")); const response = await dispatch(path);
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "WORKER_DEVICE_AUTH_UNAVAILABLE" });
    expectNoCommand();
  });
});
