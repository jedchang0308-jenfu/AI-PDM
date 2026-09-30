import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { DrawingRecognitionError } from "@/lib/drawing-recognition-contract";

const mocks = vi.hoisted(() => ({ access: vi.fn(), guard: vi.fn(), rerun: vi.fn() }));
vi.mock("@/lib/platform-command-context", () => ({
  requireNumberingPlatformCommandAsync: mocks.access
}));
vi.mock("@/lib/drawing-recognition-principal-mutation", () => ({
  withPrincipalDrawingRecognitionMutation: mocks.guard
}));
vi.mock("@/lib/drawing-recognition", () => ({ rerunDrawingRecognition: mocks.rerun }));

import { POST } from "@/app/api/numbering/recognition-sessions/[sessionId]/reruns/route";

const snapshot = { kind: "postgres", transactionScope: "postgres" } as AsyncDatabaseClient;
const metadata = { actor: { principalId: "principal-one", pdmUserId: "profile-one" } };
const request = new Request("https://ai-pdm.test/api/numbering/recognition-sessions/session-one/reruns", {
  method: "POST"
});
const context = { params: Promise.resolve({ sessionId: "session-one" }) };

describe("recognition rerun entrypoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ response: null,
      actor: { pdmUserId: "profile-one" }, company: { companyId: "company-one" }, metadata });
    mocks.rerun.mockResolvedValue({ id: "rerun-one" });
    mocks.guard.mockImplementation(async (input) => input.execute(snapshot, {
      allowed: true, principalId: "principal-one", permissionCode: "numbering.recognition.run"
    }, { session: { principalId: "principal-one" } }));
  });

  it("passes the verified Principal from the write snapshot to the rerun", async () => {
    const response = await POST(request, context);
    expect(response.status).toBe(201);
    expect(mocks.rerun).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-one", companyId: "company-one", actorId: "profile-one",
      initiatorPrincipalId: "principal-one", client: snapshot
    }));
  });

  it("does not rerun after the grant is revoked", async () => {
    mocks.guard.mockRejectedValueOnce(new DrawingRecognitionError(
      "RECOGNITION_PERMISSION_DENIED", "目前帳號沒有此辨識操作權限。", 403));
    expect((await POST(request, context)).status).toBe(403);
    expect(mocks.rerun).not.toHaveBeenCalled();
  });
});
