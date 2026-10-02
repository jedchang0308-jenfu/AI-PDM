import { afterEach, describe, expect, it } from "vitest";
import { authenticateWorkerService, rejectWorkerCapability, rejectWorkerLabel } from "./worker-service-auth";

const token = Buffer.alloc(32, 11).toString("base64url");
const otherToken = Buffer.alloc(32, 12).toString("base64url");
const native = { id: "native-preview", token, purposes: ["preview_jobs", "preview_heartbeat"], capabilities: ["solidworks_3d_preview_png"] };
const recognition = { id: "drawing-recognition", token: otherToken, purposes: ["recognition_jobs", "recognition_heartbeat"], capabilities: ["solidworks_document_manager"] };
const previous = process.env.PDM_WORKLOAD_AUTH_CREDENTIALS;
afterEach(() => { if (previous === undefined) delete process.env.PDM_WORKLOAD_AUTH_CREDENTIALS; else process.env.PDM_WORKLOAD_AUTH_CREDENTIALS = previous; });
function configure(workloads: unknown = [native, recognition]) {
  process.env.PDM_WORKLOAD_AUTH_CREDENTIALS = JSON.stringify({ schemaVersion: "ai-pdm.workload-credentials.v1", workloads });
}
function request(value = token, extra: Record<string, string> = {}) {
  return new Request("https://ai-pdm.example/api/preview-jobs/claim", { headers: { authorization: `Bearer ${value}`, ...extra } });
}
function status(result: ReturnType<typeof authenticateWorkerService>) { return "response" in result ? result.response.status : 200; }

describe("owner-bound technical workload authentication", () => {
  it("resolves distinct credentials to distinct server-owned actors and purpose scopes", () => {
    configure();
    const result = authenticateWorkerService(request(), "preview_jobs");
    expect(status(result)).toBe(200);
    if ("response" in result) throw Error("Expected authenticated workload");
    expect(result.actor).toEqual({ kind: "workload", id: native.id, purposes: native.purposes, capabilities: native.capabilities });
    expect(Object.isFrozen(result.actor)).toBe(true);
    expect(rejectWorkerLabel(result.actor, undefined)).toBeNull();
    expect(rejectWorkerLabel(result.actor, native.id)).toBeNull();
    expect(rejectWorkerLabel(result.actor, recognition.id)?.status).toBe(403);
    expect(rejectWorkerCapability(result.actor, "solidworks_2d_preview_png")?.status).toBe(403);
    expect(status(authenticateWorkerService(request(), "solidworks_credential"))).toBe(403);
    expect(status(authenticateWorkerService(request(), "recognition_jobs"))).toBe(403);
    expect(status(authenticateWorkerService(request(otherToken), "recognition_jobs"))).toBe(200);
  });
  it("rejects token, header, instance, and Principal-label spoofing", () => {
    configure();
    const spoofedHeaders: Record<string, string>[] = [
      { "x-pdm-preview-worker-id": recognition.id }, { "x-pdm-recognition-worker-id": recognition.id },
      { "x-pdm-worker-id": "principal-shijie" }, { "x-pdm-preview-worker-token": otherToken }
    ];
    for (const extra of spoofedHeaders) expect(status(authenticateWorkerService(request(token, extra), "preview_jobs"))).toBe(403);
    expect(status(authenticateWorkerService(request(token, { "x-pdm-preview-worker-token": token }), "preview_jobs"))).toBe(403);
    expect(status(authenticateWorkerService(request(Buffer.alloc(32, 13).toString("base64url")), "preview_jobs"))).toBe(403);
    expect(status(authenticateWorkerService(new Request("https://ai-pdm.example", { headers: { authorization: `bEaReR ${token}` } }), "preview_jobs"))).toBe(200);
    expect(status(authenticateWorkerService(new Request("https://ai-pdm.example", { headers: { "x-pdm-preview-worker-token": token } }), "preview_jobs"))).toBe(403);
  });
  it("fails closed on missing, malformed, ambiguous or human-authority configuration", () => {
    for (const value of [undefined, "", "{}", "not-json"]) {
      if (value === undefined) delete process.env.PDM_WORKLOAD_AUTH_CREDENTIALS; else process.env.PDM_WORKLOAD_AUTH_CREDENTIALS = value;
      expect(status(authenticateWorkerService(request(), "preview_jobs"))).toBe(503);
    }
    for (const workloads of [[], [native, native], [native, { ...recognition, token }],
      [{ ...native, token: "legacy-shared-worker-token" }], [{ ...native, purposes: ["human_admin"] }],
      [{ ...native, principalId: "principal-shijie" }], [{ ...native, capabilities: ["system_admin"] }],
      [{ ...native, capabilities: [] }], [{ ...recognition, capabilities: ["solidworks_3d_preview_png"] }]]) {
      configure(workloads);
      expect(status(authenticateWorkerService(request(), "preview_jobs"))).toBe(503);
    }
  });
  it("revoked credential stops authenticating without cached grants or old token fallback", () => {
    configure();
    expect(status(authenticateWorkerService(request(), "preview_jobs"))).toBe(200);
    configure([{ ...native, token: otherToken }]);
    expect(status(authenticateWorkerService(request(), "preview_jobs"))).toBe(403);
    expect(status(authenticateWorkerService(request(otherToken), "preview_jobs"))).toBe(200);
  });
});
