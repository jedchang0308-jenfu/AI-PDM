import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { previewLeaseHeader } from "@/lib/preview-worker-lease";
import { recognitionLeaseHeader } from "@/lib/recognition-worker-lease";
import type { WindowsServiceDevice } from "@/lib/windows-service-devices";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), preview: vi.fn(), recognition: vi.fn(), secret: vi.fn(), configured: vi.fn() }));
vi.mock("@/lib/windows-service-devices", async original => ({
  ...await original<typeof import("@/lib/windows-service-devices")>(),
  WindowsServiceDeviceRepository: class { findAuthorizedByCredentialHash(hash: string) { return mocks.authorize(hash); } }
}));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: () => ({
  kind: "postgres", transaction: async (run: (tx: unknown) => unknown) => run({ kind: "postgres" })
}) }));
vi.mock("@/lib/preview-derivatives", () => ({ hasClaimedPreviewSourceAccessAsync: mocks.preview }));
vi.mock("@/lib/repositories/drawing-recognition-async-repository", () => ({
  DrawingRecognitionAsyncRepository: class { getClaimedSourceForWorker(input: unknown) { return mocks.recognition(input); } }
}));
vi.mock("@/lib/settings-secret-lifecycle", () => ({ resolveActiveSolidWorksDocumentManagerKey: mocks.secret,
  isActiveSolidWorksDocumentManagerKeyConfigured: mocks.configured }));
import { GET } from "@/app/api/preview-workers/solidworks-document-manager-key/route";

const token = Buffer.alloc(32, 79).toString("base64url");
const credentialHash = createHash("sha256").update(token).digest("hex");
const device: WindowsServiceDevice = { id: "device-one", companyId: "company-one", name: "Native PC",
  status: "active", instanceId: "instance-one", serviceVersion: "test", protocolVersion: 1,
  ownerPrincipalId: "principal-one", registeredBy: "principal-one", registeredAt: "2026-10-28T00:00:00.000Z",
  lastSeenAt: null, revokedAt: null, revokedBy: null, rowVersion: 1 };
const owner = { principalId: device.ownerPrincipalId, employeeId: "employee-one", pdmUserId: "profile-one",
  companyId: device.companyId, identityIssuer: "https://accounts.google.com", identitySubject: "subject-one" };
const found = { device, owner, credentialHash };
const workerId = `${device.id}:${device.instanceId}`;
const previewBasis = { companyId: device.companyId, sourceFileAssetId: "asset-one",
  sourceContentHash: "a".repeat(64), attemptCount: 1, lockedAt: "2026-10-28T00:00:00.000Z" };
const recognitionBasis = { companyId: device.companyId, sourceSetFingerprint: "source-set-one",
  attemptCount: 1, lockedAt: "2026-10-28T00:00:00.000Z" };
function request(kind?: "preview" | "recognition", authenticated = true) {
  const query = kind ? `?kind=${kind}&jobId=job-one${kind === "recognition" ? "&sourceId=source-one" : ""}` : "";
  const header = kind === "preview" ? previewLeaseHeader : recognitionLeaseHeader;
  const envelope = { leaseProtocolVersion: kind === "preview" ? 2 : 1,
    leaseBasis: kind === "preview" ? previewBasis : recognitionBasis };
  return new Request(`https://pdm.example/api/preview-workers/solidworks-document-manager-key${query}`, {
    headers: { "x-pdm-worker-id": workerId, ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
      ...(kind ? { [header]: Buffer.from(JSON.stringify(envelope)).toString("base64url") } : {}) }
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue(found);
  mocks.preview.mockResolvedValue(true);
  mocks.recognition.mockResolvedValue({ fileName: "owned.SLDASM" });
  mocks.secret.mockResolvedValue({ value: "synthetic-licensed-key", source: "test", version: 2, fingerprint: "fixture" });
  mocks.configured.mockResolvedValue(true);
});
describe("Document Manager credential is bound to a current native job", () => {
  it.each([true, false])("returns only non-secret readiness metadata (%s) before a job is claimed", async available => {
    mocks.configured.mockResolvedValue(available);
    const incoming = request();
    const response = await GET(new Request(`${incoming.url}?readiness=1`, { headers: incoming.headers }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available });
    expect(mocks.secret).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.recognition).not.toHaveBeenCalled();
  });
  it("rejects anonymous callers before job or secret reads", async () => {
    expect((await GET(request("preview", false))).status).toBe(403);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.secret).not.toHaveBeenCalled();
  });
  it("does not give an idle active device the credential", async () => {
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "WORKER_JOB_LEASE_REQUIRED" });
    expect(mocks.secret).not.toHaveBeenCalled();
  });
  it("rejects a stale, wrong-owner or inaccessible preview before the provider", async () => {
    mocks.preview.mockResolvedValue(false);
    expect((await GET(request("preview"))).status).toBe(403);
    expect(mocks.secret).not.toHaveBeenCalled();
  });
  it.each(["preview", "recognition"] as const)("rechecks device and %s lease after the provider answers", async kind => {
    const response = await GET(request(kind));
    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledTimes(2);
    expect(mocks.secret).toHaveBeenCalledOnce();
    const guard = kind === "preview" ? mocks.preview : mocks.recognition;
    expect(guard).toHaveBeenCalledTimes(2);
    if (kind === "preview") expect(guard).toHaveBeenLastCalledWith(expect.anything(), {
      jobId: "job-one", workerId, ownerPrincipalId: owner.principalId, leaseBasis: previewBasis
    });
    else expect(guard).toHaveBeenLastCalledWith({ sessionId: "job-one", sourceId: "source-one",
      workerId, ownerPrincipalId: owner.principalId, leaseBasis: recognitionBasis });
  });
  it("withholds the credential if device revocation commits during provider I/O", async () => {
    mocks.authorize.mockResolvedValueOnce(found).mockResolvedValueOnce(null);
    const response = await GET(request("preview"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "WORKER_DEVICE_UNAUTHORIZED" });
    expect(mocks.secret).toHaveBeenCalledOnce();
  });
  it("withholds the credential if resource access changes during provider I/O", async () => {
    mocks.preview.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const response = await GET(request("preview"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "WORKER_JOB_LEASE_REQUIRED" });
  });
  it("withholds a recognition credential when source authority is revoked during provider I/O", async () => {
    mocks.recognition.mockResolvedValueOnce({ fileName: "owned.SLDASM" })
      .mockRejectedValueOnce(Object.assign(new Error("source denied"), { status: 403 }));
    const response = await GET(request("recognition"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "WORKER_JOB_LEASE_REQUIRED" });
  });
  it("rejects a non-native recognition source before secret access", async () => {
    mocks.recognition.mockResolvedValue({ fileName: "owned.pdf" });
    expect((await GET(request("recognition"))).status).toBe(403);
    expect(mocks.secret).not.toHaveBeenCalled();
  });
  it("keeps dependency failures redacted and unavailable", async () => {
    mocks.secret.mockRejectedValue(new Error("synthetic-private-provider-canary"));
    const response = await GET(request("preview"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "DOCUMENT_MANAGER_CREDENTIAL_READ_FAILED" });
  });
  it.each([403, 404, 409])("does not misclassify provider status %s as device or job revocation", async status => {
    mocks.secret.mockRejectedValue(Object.assign(new Error("synthetic-private-provider-canary"), { status }));
    const response = await GET(request("preview"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "DOCUMENT_MANAGER_CREDENTIAL_READ_FAILED" });
  });
});
