import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";

const mocks = vi.hoisted(() => ({ evaluate: vi.fn() }));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));

import { requireRecognitionPostReleaseGrantInSnapshot } from "@/lib/drawing-recognition-formalization-authorization";

const snapshot = {} as AsyncDatabaseClient;
const verified = { session: { principalId: "principal-one" } } as VerifiedPrincipalRequest;

describe("recognition formalization's released-target grant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not require the extra grant when the final impact changes no released target", async () => {
    await expect(requireRecognitionPostReleaseGrantInSnapshot(snapshot, verified, false)).resolves.toBeUndefined();
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it("accepts only the verified principal's published action in the write snapshot", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true, principalId: "principal-one",
      permissionCode: "post_release_change" }]);
    await expect(requireRecognitionPostReleaseGrantInSnapshot(snapshot, verified, true)).resolves.toBeUndefined();
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, verified,
      [{ permissionKind: "action", permissionCode: "post_release_change" }]);
  });

  it.each([
    { caseName: "missing", decisions: [] },
    { caseName: "denied", decisions: [{ allowed: false, principalId: "principal-one", permissionCode: "post_release_change" }] },
    { caseName: "another principal", decisions: [{ allowed: true, principalId: "another-principal", permissionCode: "post_release_change" }] },
    { caseName: "another permission", decisions: [{ allowed: true, principalId: "principal-one", permissionCode: "numbering.recognition.formalize" }] }
  ])("rejects $caseName grants before business writes", async ({ decisions }) => {
    mocks.evaluate.mockResolvedValueOnce(decisions);
    await expect(requireRecognitionPostReleaseGrantInSnapshot(snapshot, verified, true))
      .rejects.toMatchObject({ code: "RECOGNITION_POST_RELEASE_PERMISSION_DENIED", status: 403 });
  });
});
