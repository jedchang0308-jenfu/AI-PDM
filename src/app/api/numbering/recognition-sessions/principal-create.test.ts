import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { DrawingRecognitionError } from "@/lib/drawing-recognition-contract";

const mocks = vi.hoisted(() => ({ access: vi.fn(), guard: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/platform-command-context", () => ({
  requireNumberingPlatformCommandAsync: mocks.access
}));
vi.mock("@/lib/drawing-recognition-principal-mutation", () => ({
  withPrincipalDrawingRecognitionMutation: mocks.guard
}));
vi.mock("@/lib/drawing-recognition", () => ({
  createDrawingRecognitionSession: mocks.create
}));

import { POST } from "@/app/api/numbering/recognition-sessions/route";

const snapshot = { kind: "postgres", transactionScope: "postgres" } as AsyncDatabaseClient;
const metadata = { actor: { principalId: "principal-one", pdmUserId: "profile-one" } };
function request() {
  return new Request("https://ai-pdm.test/api/numbering/recognition-sessions", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceContextType: "drawing_number", sourceContextId: "drawing-one" })
  });
}

describe("recognition queue entrypoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ response: null,
      actor: { pdmUserId: "profile-one" }, company: { companyId: "company-one" }, metadata });
    mocks.create.mockResolvedValue({ id: "recognition-one" });
    mocks.guard.mockImplementation(async (input) => input.execute(snapshot, {
      allowed: true, principalId: "principal-one", permissionCode: "numbering.recognition.run"
    }, { session: { principalId: "principal-one" } }));
  });

  it("queues in the same write snapshot that rechecked the verified Principal grant", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(mocks.guard).toHaveBeenCalledWith(expect.objectContaining({
      metadata, permissionCode: "numbering.recognition.run",
      actorId: "profile-one", companyId: "company-one"
    }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "profile-one", companyId: "company-one", client: snapshot,
      initiatorPrincipalId: "principal-one"
    }));
  });

  it("does not queue after the grant is revoked in the write snapshot", async () => {
    mocks.guard.mockRejectedValueOnce(new DrawingRecognitionError(
      "RECOGNITION_PERMISSION_DENIED", "目前帳號沒有此辨識操作權限。", 403));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
