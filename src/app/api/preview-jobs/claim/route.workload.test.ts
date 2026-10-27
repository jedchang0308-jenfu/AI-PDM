import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ claim: vi.fn(), database: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: mocks.database }));
vi.mock("@/lib/preview-derivatives", () => ({ claimPreviewJobAsync: mocks.claim }));
vi.mock("@/lib/worker-service-auth", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/worker-service-auth")>(), authenticateWorkerService: mocks.auth
}));
import { POST } from "./route";

const actor = { kind: "windows_service_device", id: "device-one:instance-one", deviceId: "device-one",
  companyId: "company-one", instanceId: "instance-one", credentialHash: "a".repeat(64), device: {},
  purposes: ["preview_jobs", "preview_heartbeat", "recognition_jobs", "recognition_heartbeat", "settings_secret_probe", "solidworks_credential"],
  capabilities: ["solidworks_2d_preview_png", "solidworks_3d_preview_png", "solidworks_document_manager"] };
function request(body: Record<string, unknown>) {
  return new Request("https://owner.example/api/preview-jobs/claim", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ leaseProtocolVersion: 2, ...body }) });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ actor }); mocks.database.mockReturnValue({});
  mocks.claim.mockResolvedValue({ jobId: "claimed-png" });
});

it("does not let a device claim PDF or unknown kinds", async () => {
  for (const supportedKinds of [["drawing_pdf"], ["native_thumbnail_png", "drawing_pdf"], ["unknown"], []]) {
    const response = await POST(request({ workerId: actor.id, supportedKinds, supportedExtensions: ["slddrw"] }));
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: "WORKLOAD_JOB_SCOPE_FORBIDDEN" });
  }
  expect(mocks.claim).not.toHaveBeenCalled(); expect(mocks.database).not.toHaveBeenCalled();
});

it("allows the official 2D and 3D extensions within the authenticated company", async () => {
  const response = await POST(request({ workerId: actor.id, supportedKinds: ["native_thumbnail_png"],
    supportedExtensions: ["slddrw", "sldprt", "sldasm", "step"] }));
  expect(response.status).toBe(200);
  expect(mocks.claim).toHaveBeenCalledWith({}, { leaseProtocolVersion: 2, workerId: actor.id,
    companyId: "company-one", supportedKinds: ["native_thumbnail_png"],
    supportedExtensions: ["slddrw", "sldprt", "sldasm"] });
});

it("preserves the default native PNG scope", async () => {
  expect((await POST(request({ workerId: actor.id }))).status).toBe(200);
  expect(mocks.claim).toHaveBeenCalledWith({}, expect.objectContaining({ companyId: "company-one",
    supportedKinds: ["native_thumbnail_png"], supportedExtensions: ["sldprt", "sldasm", "slddrw"] }));
});

it.each([undefined, 1, "2", null])("rejects missing or illegal protocol before service/recovery: %j", async leaseProtocolVersion => {
  const response = await POST(request({ leaseProtocolVersion, workerId: actor.id }));
  expect(response.status).toBe(400); expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled();
});

it("echoes version even when idle", async () => {
  mocks.claim.mockResolvedValue(null); const response = await POST(request({ workerId: actor.id }));
  expect(await response.json()).toEqual({ leaseProtocolVersion: 2, job: null });
});
