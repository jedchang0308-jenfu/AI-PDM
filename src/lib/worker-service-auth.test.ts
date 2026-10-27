import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticateDevice: vi.fn() }));
vi.mock("@/lib/windows-service-device-auth", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/windows-service-device-auth")>(),
  authenticateWindowsServiceDevice: mocks.authenticateDevice
}));

import {
  authenticateWorkerService,
  rejectWorkerCapability,
  rejectWorkerLabel
} from "./worker-service-auth";
import type { VerifiedWindowsServiceDevice } from "./windows-service-device-auth";

const actor: VerifiedWindowsServiceDevice = {
  kind: "windows_service_device",
  id: "device-one:instance-one",
  deviceId: "device-one",
  companyId: "company-one",
  instanceId: "instance-one",
  credentialHash: "a".repeat(64),
  ownerPrincipalId: "principal-one",
  owner: { principalId: "principal-one", employeeId: "employee-one", pdmUserId: "profile-one",
    companyId: "company-one", identityIssuer: "issuer", identitySubject: "subject" },
  device: {
    id: "device-one", companyId: "company-one", name: "Worker One", status: "active",
    instanceId: "instance-one", serviceVersion: "test", protocolVersion: 1,
    ownerPrincipalId: "principal-one",
    registeredBy: "profile-one", registeredAt: "2026-10-23T00:00:00.000Z",
    lastSeenAt: null, revokedAt: null, revokedBy: null, rowVersion: 1
  },
  purposes: ["preview_jobs", "preview_heartbeat", "recognition_jobs", "recognition_heartbeat", "settings_secret_probe", "solidworks_credential"],
  capabilities: ["solidworks_3d_preview_png", "solidworks_2d_preview_png", "solidworks_document_manager"]
};

function request(extra: Record<string, string> = {}) {
  return new Request("https://ai-pdm.example/api/preview-jobs/claim", { headers: extra });
}
async function status(result: ReturnType<typeof authenticateWorkerService>) {
  const resolved = await result;
  return "response" in resolved ? resolved.response.status : 200;
}

describe("DEV-125 current device authentication", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authenticateDevice.mockResolvedValue({ actor });
  });

  it("delegates every request to the current PostgreSQL-backed device verifier", async () => {
    const first = await authenticateWorkerService(request(), "preview_jobs");
    const second = await authenticateWorkerService(request(), "recognition_jobs");
    expect(mocks.authenticateDevice).toHaveBeenCalledTimes(2);
    if ("response" in first || "response" in second) throw Error("Expected authenticated device");
    expect(first.actor).toBe(actor);
    expect(second.actor.companyId).toBe("company-one");
  });

  it("has no legacy environment credential fallback", async () => {
    vi.stubEnv("PDM_WORKLOAD_AUTH_CREDENTIALS", JSON.stringify({ schemaVersion: "ai-pdm.workload-credentials.v1", workloads: [] }));
    mocks.authenticateDevice.mockResolvedValueOnce({ response: NextResponse.json({ error: "WORKER_DEVICE_UNAUTHORIZED" }, { status: 403 }) });
    expect(await status(authenticateWorkerService(request(), "preview_jobs"))).toBe(403);
  });

  it("rejects route-specific worker-label spoofing after device authentication", async () => {
    for (const header of ["x-pdm-preview-worker-id", "x-pdm-recognition-worker-id"]) {
      expect(await status(authenticateWorkerService(request({ [header]: "foreign-instance" }), "preview_jobs"))).toBe(403);
    }
    expect(await status(authenticateWorkerService(request({ "x-pdm-preview-worker-id": actor.id }), "preview_jobs"))).toBe(200);
    expect(rejectWorkerLabel(actor, undefined)).toBeNull();
    expect(rejectWorkerLabel(actor, actor.id)).toBeNull();
    expect(rejectWorkerLabel(actor, "foreign-instance")?.status).toBe(403);
  });

  it("enforces server-owned capability and purpose vocabularies", async () => {
    expect(rejectWorkerCapability(actor, "solidworks_document_manager")).toBeNull();
    expect(await status(authenticateWorkerService(request(), "settings_secret_probe"))).toBe(200);
    expect(mocks.authenticateDevice).toHaveBeenCalledTimes(1);
  });

  it("propagates current revocation and auth dependency failures without caching", async () => {
    expect(await status(authenticateWorkerService(request(), "preview_jobs"))).toBe(200);
    mocks.authenticateDevice.mockResolvedValueOnce({ response: NextResponse.json({ error: "WORKER_DEVICE_UNAUTHORIZED" }, { status: 403 }) });
    expect(await status(authenticateWorkerService(request(), "preview_jobs"))).toBe(403);
    mocks.authenticateDevice.mockResolvedValueOnce({ response: NextResponse.json({ error: "WORKER_DEVICE_AUTH_UNAVAILABLE" }, { status: 503 }) });
    expect(await status(authenticateWorkerService(request(), "preview_jobs"))).toBe(503);
  });
});
