import { describe, expect, it } from "vitest";
import { addTransferDraftWorkspace, removeTransferDraftWorkspace } from "@/lib/transfer-package-phase1d";
import type { PdmCommandMetadata } from "@/lib/platform-command";

const metadata = { actor: { pdmUserId: "profile-one", organizationId: "company-one",
  principalId: "principal-one" }, idempotencyKey: "operation-one" } as PdmCommandMetadata;

describe("transfer draft scope actor binding", () => {
  it("rejects a profile/principal mismatch before opening a command transaction", async () => {
    await expect(addTransferDraftWorkspace({ metadata,
      actor: { userId: "profile-one", companyId: "company-one", role: "Admin",
        principalId: "principal-other" }, packageId: "package-one", expectedRowVersion: 1,
      workspaceId: "workspace-one", requiredness: "required", inclusionReason: "Scope" }))
      .rejects.toMatchObject({ code: "TRANSFER_PACKAGE_ACTOR_MISMATCH", status: 403 });
    await expect(removeTransferDraftWorkspace({ metadata,
      actor: { userId: "profile-other", companyId: "company-one", role: "Admin",
        principalId: "principal-one" }, packageId: "package-one", itemId: "item-one",
      expectedRowVersion: 1, reason: "Correction" }))
      .rejects.toMatchObject({ code: "TRANSFER_PACKAGE_ACTOR_MISMATCH", status: 403 });
  });
});
