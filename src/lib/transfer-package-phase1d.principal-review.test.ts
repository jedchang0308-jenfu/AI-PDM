import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlatformActorContext } from "@/lib/platform-command";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/platform-command-service", () => ({ executePdmCommandWithOutbox: mocks.execute }));

import { decideTransferPackageReview, submitTransferPackageReview, withdrawTransferPackageReview } from "@/lib/transfer-package-phase1d";

const metadata = { actor: createPlatformActorContext({
  pdmUserId: "profile-owner", organizationId: "company-one", principalId: "principal-one",
  roles: ["Admin"] }), idempotencyKey: "review-one" };

describe("Principal transfer review resource fence", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not accept historical profile ownership or role without the command-time decision", async () => {
    const queryOne = vi.fn(async () => ({ owner_id: "profile-owner", package_status: "Draft",
      row_version: 1, review_request_id: "request-one" }));
    const execute = vi.fn(async () => undefined);
    const client = { kind: "postgres", queryOne, execute };
    mocks.execute.mockImplementation(async (input) => input.execute(client, null));

    await expect(submitTransferPackageReview({ metadata, packageId: "package-one",
      expectedRowVersion: 1, reason: "Review" })).rejects.toMatchObject({
        code: "TRANSFER_PACKAGE_FORBIDDEN", status: 403
      });
    await expect(withdrawTransferPackageReview({ metadata, packageId: "package-one",
      expectedRowVersion: 1 })).rejects.toMatchObject({
        code: "TRANSFER_PACKAGE_FORBIDDEN", status: 403
      });
    expect(queryOne).toHaveBeenCalledTimes(2);
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses an unassigned Principal before changing a transfer review", async () => {
    const queryOne = vi.fn(async (sql: string) => sql.includes("FROM approval_platform_requests")
      ? { id: "request-one", request_status: "pending", payload_json: JSON.stringify({
          transferPackageId: "package-one", snapshotHash: "a".repeat(64),
          reviewer: { version: 1, principalId: "principal-other", profileId: "profile-other" }
        }) } : null);
    const execute = vi.fn(async () => undefined);
    mocks.execute.mockImplementation(async (input) => input.execute({ kind: "postgres", queryOne, execute }, {
      allowed: true, principalId: "principal-one", permissionCode: "approval.request.decide", roleCode: "rd_manager"
    }));

    await expect(decideTransferPackageReview({ metadata, requestId: "request-one",
      decision: "approved", comment: null })).rejects.toMatchObject({
        code: "TRANSFER_REVIEWER_NOT_ASSIGNED", status: 403
      });
    expect(queryOne).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses a historical transfer request without a verifiable reviewer binding", async () => {
    const queryOne = vi.fn(async () => ({ id: "request-one", request_status: "pending",
      payload_json: "{invalid-json" }));
    const execute = vi.fn(async () => undefined);
    mocks.execute.mockImplementation(async (input) => input.execute({ kind: "postgres", queryOne, execute }, {
      allowed: true, principalId: "principal-one", permissionCode: "approval.request.decide", roleCode: "rd_manager"
    }));

    await expect(decideTransferPackageReview({ metadata, requestId: "request-one",
      decision: "approved", comment: null })).rejects.toMatchObject({
        code: "TRANSFER_REVIEW_BINDING_INVALID", status: 409
      });
    expect(execute).not.toHaveBeenCalled();
  });
});
