import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recognitionLeaseHeader } from "@/lib/recognition-worker-lease";
import type { WindowsServiceDevice } from "@/lib/windows-service-devices";

const mocks = vi.hoisted(() => ({
  findAuthorizedByCredentialHash: vi.fn(),
  readClaimedDrawingRecognitionSource: vi.fn(),
  resolveSettingsSecretProbeCredential: vi.fn(),
  getProbeJobById: vi.fn(),
  getLatestIntent: vi.fn(),
  heartbeatProbeJob: vi.fn(),
  completeSettingsSecretProbe: vi.fn()
}));

vi.mock("@/lib/windows-service-devices", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/windows-service-devices")>(),
  WindowsServiceDeviceRepository: class {
    findAuthorizedByCredentialHash(credentialHash: string) {
      return mocks.findAuthorizedByCredentialHash(credentialHash);
    }
  }
}));
vi.mock("@/lib/db-async-provider", () => ({
  getAsyncDatabaseClient: () => ({ kind: "postgres" })
}));
vi.mock("@/lib/drawing-recognition", () => ({
  readClaimedDrawingRecognitionSource: mocks.readClaimedDrawingRecognitionSource
}));
vi.mock("@/lib/repositories/settings-secret-async-repository", () => ({
  AsyncSettingsSecretRepository: class {
    getProbeJobById(...args: unknown[]) { return mocks.getProbeJobById(...args); }
    getLatestIntent(...args: unknown[]) { return mocks.getLatestIntent(...args); }
    heartbeatProbeJob(...args: unknown[]) { return mocks.heartbeatProbeJob(...args); }
  }
}));
vi.mock("@/lib/settings-secret-lifecycle", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/settings-secret-lifecycle")>(),
  resolveSettingsSecretProbeCredential: mocks.resolveSettingsSecretProbeCredential,
  completeSettingsSecretProbe: mocks.completeSettingsSecretProbe
}));

import { GET as readRecognitionSource } from "@/app/api/recognition-jobs/[sessionId]/sources/[sourceId]/content/route";
import { GET as readProbeCredential } from "@/app/api/settings-secret-probe-jobs/[jobId]/credential/route";
import { POST as heartbeatProbe } from "@/app/api/settings-secret-probe-jobs/[jobId]/heartbeat/route";
import { POST as completeProbe } from "@/app/api/settings-secret-probe-jobs/[jobId]/complete/route";

const token = Buffer.alloc(32, 37).toString("base64url");
const device: WindowsServiceDevice = {
  id: "device-one", companyId: "company-one", status: "active" as const,
  instanceId: "instance-one", protocolVersion: 1, name: "Caller test PC", serviceVersion: "test",
  ownerPrincipalId: "principal-one", registeredBy: "principal-one",
  registeredAt: "2026-10-23T00:00:00.000Z", lastSeenAt: null,
  revokedAt: null, revokedBy: null, rowVersion: 1
};
const workerId = `${device.id}:${device.instanceId}`;
const owner = {
  principalId: "principal-one", employeeId: "employee-one", pdmUserId: "profile-one",
  companyId: device.companyId, identityIssuer: "https://accounts.google.com", identitySubject: "subject-one"
};
const leaseBasis = {
  companyId: device.companyId, sourceSetFingerprint: "fixture-fingerprint",
  attemptCount: 1, lockedAt: "2026-10-23T00:00:00.000Z"
};
const leaseHeader = Buffer.from(JSON.stringify({ leaseProtocolVersion: 1, leaseBasis })).toString("base64url");
const context = { params: Promise.resolve({ sessionId: "recognition-fixture", sourceId: "source-fixture" }) };
const probeContext = { params: Promise.resolve({ jobId: "probe-fixture" }) };

function authHeaders(authenticated: boolean) {
  return {
    ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
    "x-pdm-worker-id": workerId
  };
}

function recognitionSourceRequest(authenticated: boolean) {
  return new Request("https://pdm.example/api/recognition-jobs/recognition-fixture/sources/source-fixture/content", {
    headers: { ...authHeaders(authenticated), [recognitionLeaseHeader]: leaseHeader }
  });
}

function probeCredentialRequest(authenticated: boolean) {
  return new Request("https://pdm.example/api/settings-secret-probe-jobs/probe-fixture/credential?leaseAttempt=2", {
    headers: authHeaders(authenticated)
  });
}

function probeHeartbeatRequest(authenticated: boolean) {
  return new Request("https://pdm.example/api/settings-secret-probe-jobs/probe-fixture/heartbeat", {
    method: "POST",
    headers: { ...authHeaders(authenticated), "content-type": "application/json" },
    body: JSON.stringify({ workerId, leaseAttempt: 2 })
  });
}

function probeCompletionRequest(authenticated: boolean) {
  return new Request("https://pdm.example/api/settings-secret-probe-jobs/probe-fixture/complete", {
    method: "POST",
    headers: { ...authHeaders(authenticated), "content-type": "application/json" },
    body: JSON.stringify({ workerId, status: "passed", leaseAttempt: 2, readerVersion: "reader-fixture" })
  });
}

const callers = [
  {
    name: "recognition source GET",
    invoke: (authenticated: boolean) => readRecognitionSource(recognitionSourceRequest(authenticated), context),
    effects: [mocks.readClaimedDrawingRecognitionSource]
  },
  {
    name: "probe credential GET",
    invoke: (authenticated: boolean) => readProbeCredential(probeCredentialRequest(authenticated), probeContext),
    effects: [mocks.resolveSettingsSecretProbeCredential]
  },
  {
    name: "probe heartbeat POST",
    invoke: (authenticated: boolean) => heartbeatProbe(probeHeartbeatRequest(authenticated), probeContext),
    effects: [mocks.getProbeJobById, mocks.getLatestIntent, mocks.heartbeatProbeJob]
  },
  {
    name: "probe complete POST",
    invoke: (authenticated: boolean) => completeProbe(probeCompletionRequest(authenticated), probeContext),
    effects: [mocks.completeSettingsSecretProbe]
  }
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findAuthorizedByCredentialHash.mockImplementation(async (credentialHash: string) => ({
    device, owner, credentialHash
  }));
  mocks.readClaimedDrawingRecognitionSource.mockResolvedValue({
    bytes: Buffer.from("fixture source bytes"), fileName: "fixture.slddrw",
    mimeType: "application/octet-stream", contentHash: "a".repeat(64)
  });
  mocks.resolveSettingsSecretProbeCredential.mockResolvedValue({ leaseAttempt: 2 });
  mocks.getProbeJobById.mockResolvedValue(null);
  mocks.getLatestIntent.mockResolvedValue(null);
  mocks.heartbeatProbeJob.mockResolvedValue(true);
  mocks.completeSettingsSecretProbe.mockResolvedValue({ id: "probe-run-fixture", workflow: { status: "passed" } });
});

describe.each(callers)("DEV-125 $name caller revalidates the current device", ({ invoke, effects }) => {
  it("accepts the active credential and rejects its next request after revocation", async () => {
    const credentialHash = crypto.createHash("sha256").update(token).digest("hex");
    mocks.findAuthorizedByCredentialHash
      .mockResolvedValueOnce({ device, owner, credentialHash })
      .mockResolvedValueOnce(null);

    const accepted = await invoke(true);
    expect(accepted.status).toBe(200);
    expect(effects.some((effect) => effect.mock.calls.length > 0)).toBe(true);
    if (mocks.readClaimedDrawingRecognitionSource.mock.calls.length) {
      expect(mocks.readClaimedDrawingRecognitionSource).toHaveBeenCalledWith({
        sessionId: "recognition-fixture", sourceId: "source-fixture", workerId,
        ownerPrincipalId: owner.principalId, leaseBasis
      });
    }
    if (mocks.resolveSettingsSecretProbeCredential.mock.calls.length) {
      expect(mocks.resolveSettingsSecretProbeCredential).toHaveBeenCalledWith("probe-fixture",
        expect.objectContaining({ ownerPrincipalId: owner.principalId, companyId: owner.companyId, owner }), 2);
    }
    if (mocks.heartbeatProbeJob.mock.calls.length) {
      expect(mocks.heartbeatProbeJob).toHaveBeenCalledWith("probe-fixture", workerId,
        owner.companyId, expect.any(String), 2, owner);
    }
    if (mocks.completeSettingsSecretProbe.mock.calls.length) {
      expect(mocks.completeSettingsSecretProbe).toHaveBeenCalledWith(expect.objectContaining({
        probeJobId: "probe-fixture", worker: expect.objectContaining({
          ownerPrincipalId: owner.principalId, companyId: owner.companyId, owner
        }), leaseAttempt: 2
      }));
    }
    const effectCallCounts = effects.map((effect) => effect.mock.calls.length);

    const revoked = await invoke(true);
    expect(revoked.status).toBe(403);
    expect(await revoked.json()).toEqual({ error: "WORKER_DEVICE_UNAUTHORIZED" });
    expect(mocks.findAuthorizedByCredentialHash).toHaveBeenCalledTimes(2);
    expect(mocks.findAuthorizedByCredentialHash).toHaveBeenNthCalledWith(1, credentialHash);
    expect(mocks.findAuthorizedByCredentialHash).toHaveBeenNthCalledWith(2, credentialHash);
    expect(effects.map((effect) => effect.mock.calls.length)).toEqual(effectCallCounts);
  });

  it("rejects an anonymous request before verifier or caller effects", async () => {
    const response = await invoke(false);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "WORKER_DEVICE_UNAUTHORIZED" });
    expect(mocks.findAuthorizedByCredentialHash).not.toHaveBeenCalled();
    for (const effect of effects) expect(effect).not.toHaveBeenCalled();
  });
});
