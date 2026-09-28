import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncTransferPackageRepository } from "@/lib/repositories/transfer-package-async-repository";

describe("transfer package Principal replay", () => {
  it("does not treat a matching historical domain row as a verified command receipt", async () => {
    const transaction = vi.fn();
    const repository = new AsyncTransferPackageRepository({ transaction } as unknown as AsyncDatabaseClient);
    vi.spyOn(repository, "findByIdempotency").mockResolvedValue({ id: "old-package" } as never);

    await expect(repository.createDraft({
      actor: { userId: "pdm-jed", companyId: "company-jenfu", role: "Principal",
        principalId: "principal-jed" },
      idempotencyKey: "old-key", title: "Design change", caseType: "design_change_case",
      caseReason: "Customer change", sourceReferenceStatus: "provided",
      sourceReference: "ECO-1", sourceReferenceReason: null
    })).rejects.toMatchObject({ code: "TRANSFER_PACKAGE_COMMAND_RECEIPT_REQUIRED", status: 409 });
    expect(transaction).not.toHaveBeenCalled();
  });
});
