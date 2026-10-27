import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  ownerAuthorization: vi.fn(),
  database: { kind: "postgres" },
  claim: vi.fn(),
  reference: vi.fn(),
  reconcile: vi.fn(),
  complete: vi.fn()
}));

vi.mock("@/lib/worker-service-auth", () => ({
  authenticateWorkerService: mocks.auth,
  rejectWorkerLabel: () => null,
  rejectWorkerCapability: () => null
}));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: () => mocks.database }));
vi.mock("@/lib/repositories/settings-secret-async-repository", () => ({
  AsyncSettingsSecretRepository: class {
    claimProbeJob = mocks.claim;
    getReferenceById = mocks.reference;
  }
}));
vi.mock("@/lib/settings-secret-lifecycle", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/settings-secret-lifecycle")>(),
  reconcilePendingSettingsSecretActivation: mocks.reconcile,
  completeSettingsSecretProbe: mocks.complete
}));
vi.mock("@/lib/windows-service-owner-authorization", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/windows-service-owner-authorization")>(),
  requireWindowsServiceOwnerAuthorization: mocks.ownerAuthorization
}));

import { POST as claim } from "./route";
import { POST as complete } from "../[jobId]/complete/route";
import { WindowsServiceOwnerAuthorizationError } from "@/lib/windows-service-owner-authorization";

const owner = {
  principalId: "principal-one", employeeId: "employee-one", pdmUserId: "profile-one",
  companyId: "company-one", identityIssuer: "issuer", identitySubject: "subject"
};
const worker = {
  kind: "windows_service_device", id: "worker-one", deviceId: "device-one", companyId: "company-one",
  instanceId: "instance-one", ownerPrincipalId: owner.principalId, owner, credentialHash: "a".repeat(64),
  device: {}, purposes: ["settings_secret_probe"], capabilities: ["solidworks_document_manager"]
};
const request = (body: unknown) => new Request("https://owner.test/api/settings-secret-probe-jobs/claim", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
});

describe("purpose-scoped probe protocol dispatch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockReturnValue({ actor: worker });
    mocks.ownerAuthorization.mockResolvedValue(undefined);
    mocks.claim.mockResolvedValue(null);
    mocks.complete.mockResolvedValue({ id: "test-run" });
  });

  it("legacy claim skips automatic reconciliation after current owner authorization", async () => {
    expect((await claim(request({ workerId: worker.id }))).status).toBe(204);
    expect(mocks.ownerAuthorization).toHaveBeenCalledWith(mocks.database, owner, "settings.secret.manage");
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.claim).toHaveBeenCalledWith(worker.id, worker.companyId, expect.any(String), undefined, owner);
  });

  it("protocol 2 authorizes before reconciling and selecting the queue", async () => {
    expect((await claim(request({ workerId: worker.id, protocolVersion: 2 }))).status).toBe(204);
    expect(mocks.ownerAuthorization).toHaveBeenCalledWith(mocks.database, owner, "settings.secret.manage");
    expect(mocks.reconcile).toHaveBeenCalledOnce();
    expect(mocks.claim).toHaveBeenCalledWith(worker.id, worker.companyId, expect.any(String), 2, owner);
    expect(mocks.ownerAuthorization.mock.invocationCallOrder[0]).toBeLessThan(mocks.reconcile.mock.invocationCallOrder[0]);
    expect(mocks.reconcile.mock.invocationCallOrder[0]).toBeLessThan(mocks.claim.mock.invocationCallOrder[0]);
  });

  it("returns an empty queue for a current owner without probe permission", async () => {
    mocks.ownerAuthorization.mockRejectedValue(
      new WindowsServiceOwnerAuthorizationError("WORKER_DEVICE_UNAUTHORIZED", 403)
    );

    const response = await claim(request({ workerId: worker.id, protocolVersion: 2 }));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(mocks.ownerAuthorization).toHaveBeenCalledWith(mocks.database, owner, "settings.secret.manage");
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("keeps owner-authority dependency failure retryable as 503", async () => {
    mocks.ownerAuthorization.mockRejectedValue(
      new WindowsServiceOwnerAuthorizationError("WORKER_DEVICE_AUTH_UNAVAILABLE", 503)
    );

    const response = await claim(request({ workerId: worker.id, protocolVersion: 2 }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "SECRET_PROBE_DEPENDENCY_UNAVAILABLE", retryable: true });
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it.each(["2", 1, null])("rejects noncanonical protocol %s before authority checks or writes", async protocolVersion => {
    expect((await claim(request({ protocolVersion }))).status).toBe(400);
    expect(mocks.ownerAuthorization).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("does no business work after authentication denial", async () => {
    mocks.auth.mockReturnValue({ response: Response.json({ error: "WORKLOAD_UNAUTHORIZED" }, { status: 401 }) });

    expect((await claim(request({ protocolVersion: 2 }))).status).toBe(401);
    expect(mocks.ownerAuthorization).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("passes exact lease to completion using verified actor rather than body identity", async () => {
    const response = await complete(request({ workerId: worker.id, status: "passed", leaseAttempt: 2,
      readerVersion: "reader.v1" }), { params: Promise.resolve({ jobId: "job" }) });

    expect(response.status).toBe(200);
    expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({ probeJobId: "job", leaseAttempt: 2, worker }));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([0, -1, "2", 1.1])("rejects malformed completion attempt %s without effects", async leaseAttempt => {
    expect((await complete(request({ status: "passed", leaseAttempt }),
      { params: Promise.resolve({ jobId: "job" }) })).status).toBe(400);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it.each([1, true, {}])("rejects coerced reader version %s before completion", async readerVersion => {
    expect((await complete(request({ status: "passed", leaseAttempt: 1, readerVersion }),
      { params: Promise.resolve({ jobId: "job" }) })).status).toBe(400);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("keeps complete dependency failure retryable without exposing the secret message", async () => {
    mocks.complete.mockRejectedValue(new Error("synthetic-private-canary"));

    const response = await complete(request({ status: "passed", leaseAttempt: 1 }),
      { params: Promise.resolve({ jobId: "job" }) });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "SECRET_PROBE_COMPLETE_FAILED", retryable: true });
  });
});
