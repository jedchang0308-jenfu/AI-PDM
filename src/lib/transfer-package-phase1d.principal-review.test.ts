import { describe, expect, it, vi } from "vitest";
import { createPlatformActorContext } from "@/lib/platform-command";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/lib/platform-command-service", () => ({ executePdmCommandWithOutbox: mocks.execute }));

import { submitTransferPackageReview, withdrawTransferPackageReview } from "@/lib/transfer-package-phase1d";

const metadata = { actor: createPlatformActorContext({
  pdmUserId: "profile-owner", organizationId: "company-one", principalId: "principal-one",
  roles: ["Admin"] }), idempotencyKey: "review-one" };

describe("Principal transfer review resource fence", () => {
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
});
