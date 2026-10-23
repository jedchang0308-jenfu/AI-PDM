import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { POST as claim } from "@/app/api/recognition-jobs/claim/route";
import { POST as heartbeat } from "@/app/api/recognition-jobs/[sessionId]/heartbeat/route";
import { POST as complete } from "@/app/api/recognition-jobs/[sessionId]/complete/route";

const commands = vi.hoisted(() => ({ claim: vi.fn(), heartbeat: vi.fn(), complete: vi.fn() }));
vi.mock("@/lib/drawing-recognition", () => ({
  claimDrawingRecognitionJob: commands.claim,
  heartbeatDrawingRecognitionJob: commands.heartbeat,
  completeDrawingRecognitionJob: commands.complete,
}));

const sessionId = "recognition-fixture";
const workerId = "recognition-worker-fixture";
const token = Buffer.alloc(32, 41).toString("base64url");
const paths = ["/api/recognition-jobs/claim", `/api/recognition-jobs/${sessionId}/heartbeat`,
  `/api/recognition-jobs/${sessionId}/complete`] as const;
const body = { workerId, sourceSetFingerprint: "fixture-fingerprint", results: [] };

function configure(purpose = "recognition_jobs", credential = token) {
  vi.stubEnv("PDM_WORKLOAD_AUTH_CREDENTIALS", JSON.stringify({
    schemaVersion: "ai-pdm.workload-credentials.v1",
    workloads: [{ id: workerId, token: credential, purposes: [purpose], capabilities: ["solidworks_document_manager"] }],
  }));
}

function request(path: string, authorization = `Bearer ${token}`, value: unknown = body) {
  return new NextRequest(`https://pdm.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
    body: JSON.stringify(value),
  });
}

async function dispatch(path: string, incoming = request(path)) {
  const gate = middleware(incoming);
  if (gate.headers.get("x-middleware-next") !== "1") return gate;
  const context = { params: Promise.resolve({ sessionId }) };
  if (path === paths[0]) return claim(incoming);
  return path === paths[1] ? heartbeat(incoming, context) : complete(incoming, context);
}

function expectNoCommand() {
  for (const command of Object.values(commands)) expect(command).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", "official-numbering-draft");
  configure();
  commands.claim.mockResolvedValue({ sessionId });
  commands.complete.mockResolvedValue({ id: sessionId, status: "review_ready" });
});
afterEach(() => vi.unstubAllEnvs());

describe("recognition worker dispatch retains the technical owner boundary", () => {
  it.each(paths)("dispatches exact POST %s through the real middleware and route", async path => {
    const response = await dispatch(path);
    expect(response.status).toBe(200);
    const selected = path === paths[0] ? commands.claim : path === paths[1] ? commands.heartbeat : commands.complete;
    expect(selected).toHaveBeenCalledOnce();
    expect(selected).toHaveBeenCalledWith(path === paths[0]
      ? { workerId, maxAttempts: 2, allowNativeSources: true }
      : path === paths[1] ? { sessionId, workerId }
      : { sessionId, workerId, sourceSetFingerprint: body.sourceSetFingerprint, results: [] });
    for (const other of Object.values(commands).filter(command => command !== selected)) expect(other).not.toHaveBeenCalled();
  });

  it.each(paths)("keeps %s blocked in an unknown production slice", async path => {
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", "unknown-mode");
    const response = await dispatch(path);
    expect(response.status).toBe(403);
    expect(response.headers.get("x-ai-pdm-production-slice")).toBe("unknown-mode");
    expectNoCommand();
  });

  it.each(paths)("keeps non-POST mutations closed for %s", path => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect(middleware(new NextRequest(`https://pdm.example${path}`, { method })).status).toBe(403);
    }
    expectNoCommand();
  });

  it.each([
    "/api/recognition-jobs", "/api/recognition-jobs/claim/extra",
    "/api/recognition-jobs/heartbeat", "/api/recognition-jobs/complete",
    `/api/recognition-jobs/${sessionId}/heartbeat/extra`, `/api/recognition-jobs/${sessionId}/complete/extra`,
    `/api/recognition-jobs/${sessionId}/cancel`, `/api/recognition-jobs/${sessionId}/requeue`,
    `/api/recognition-jobs/${sessionId}/sources/source-one/content`,
    "/api/recognition-jobs-extra/claim", "/api/preview-jobs/claim",
  ])("keeps unlisted worker mutation %s closed", path => {
    expect(middleware(request(path)).status).toBe(403);
    expectNoCommand();
  });

  it.each(paths)("rejects missing credentials and a human session at %s without commands", async path => {
    const incoming = request(path, "");
    incoming.headers.set("cookie", "pdm_session=synthetic-human-session");
    const response = await dispatch(path, incoming);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "WORKLOAD_FORBIDDEN" });
    expectNoCommand();
  });

  it.each(paths)("rejects the wrong workload purpose at %s without commands", async path => {
    configure("recognition_heartbeat");
    const response = await dispatch(path);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "WORKLOAD_FORBIDDEN" });
    expectNoCommand();
  });

  it.each(paths)("rejects a revoked credential at %s without commands", async path => {
    configure("recognition_jobs", Buffer.alloc(32, 42).toString("base64url"));
    const response = await dispatch(path);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "WORKLOAD_FORBIDDEN" });
    expectNoCommand();
  });

  it.each(paths)("rejects a spoofed body worker at %s without commands", async path => {
    const response = await dispatch(path, request(path, `Bearer ${token}`, { ...body, workerId: "principal-other" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "WORKLOAD_ID_MISMATCH" });
    expectNoCommand();
  });

  it.each(paths)("fails closed when workload configuration is unavailable at %s", async path => {
    vi.stubEnv("PDM_WORKLOAD_AUTH_CREDENTIALS", "");
    const response = await dispatch(path);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "WORKLOAD_AUTH_NOT_CONFIGURED" });
    expectNoCommand();
  });
});
