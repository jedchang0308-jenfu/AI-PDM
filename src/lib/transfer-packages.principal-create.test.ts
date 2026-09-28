import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  resolve: vi.fn(),
  create: vi.fn(),
  repositoryClients: [] as unknown[]
}));

vi.mock("@/lib/db-async-provider", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAsyncDatabaseClient: () => ({ kind: "postgres", marker: "root" })
}));
vi.mock("@/lib/platform-command-service", () => ({
  executePdmCommandWithOutbox: mocks.execute
}));
vi.mock("@/lib/repositories/transfer-package-async-repository", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  AsyncTransferPackageRepository: class {
    constructor(client: unknown) { mocks.repositoryClients.push(client); }
    resolveScopeEntity = mocks.resolve;
    createDraft = mocks.create;
  }
}));

import { createTransferPackageDraft } from "@/lib/transfer-packages";

const actor = {
  userId: "pdm-jed", companyId: "company-jenfu", role: "Principal", principalId: "principal-jed"
};
const metadata = {
  actor: {
    principalId: "principal-jed", pdmUserId: "pdm-jed", organizationId: "company-jenfu",
    platformOrganizationId: null, roles: [], scopes: [], authProvider: "current_pdm_session" as const,
    correlationId: "correlation-one", requestId: "request-one"
  },
  idempotencyKey: "create-one",
  principalRequest: { token: "verified-token" },
  principalAuthorization: { routePath: "src/app/api/transfer-packages/route.ts",
    method: "POST", permissionCode: "transfer.package.create" }
};
const source = { entityType: "drawing_number", entityId: "drawing-one", entityCode: "DR-1" };
const record = {
  id: "package-one", companyId: "company-jenfu", packageCode: "TP-2026-0001",
  rowVersion: 1, status: "Draft", items: [], draftItems: [], events: [], reviewRequestId: null
};

function requestInput() {
  return {
    actor, metadata: metadata as never, idempotencyKey: "create-one", title: "New design",
    caseType: "design_change_case", caseReason: "Customer change",
    sourceReferenceStatus: "provided", sourceReference: "ECO-1",
    sourceType: "drawing", sourceId: "DR-1"
  };
}

describe("Principal transfer draft creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repositoryClients.length = 0;
    mocks.resolve.mockResolvedValue(source);
    mocks.create.mockResolvedValue(record);
    mocks.execute.mockImplementation(async (input) => {
      const snapshot = { kind: "postgres", marker: "verified-write-snapshot" };
      const result = await input.execute(snapshot);
      return { result, reusedFromCommandReceipt: false };
    });
  });

  it("keeps source lookup and domain write inside the Principal command snapshot", async () => {
    const workbench = await createTransferPackageDraft(requestInput());
    expect(workbench.id).toBe("package-one");
    const commandInput = mocks.execute.mock.calls[0][0];
    expect(commandInput.command.commandName).toBe("pdm.transfer.create_draft");
    expect(commandInput.command.actor.principalId).toBe("principal-jed");
    expect(commandInput.principalRequest).toBe(metadata.principalRequest);
    expect(commandInput.principalAuthorization).toBe(metadata.principalAuthorization);
    expect(mocks.repositoryClients).toEqual([
      { kind: "postgres", marker: "verified-write-snapshot" },
      { kind: "postgres", marker: "verified-write-snapshot" }
    ]);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      actor, sourceItem: source, idempotencyKey: "create-one"
    }));
    expect(commandInput.event(record)).toEqual(expect.objectContaining({
      aggregateType: "transfer_package", aggregateId: "package-one",
      eventType: "pdm.transfer.package_draft_created.v1"
    }));
  });

  it("rejects a profile or principal mismatch before creating a command", async () => {
    await expect(createTransferPackageDraft({ ...requestInput(),
      actor: { ...actor, principalId: "different-principal" }
    })).rejects.toMatchObject({ code: "TRANSFER_PACKAGE_ACTOR_MISMATCH", status: 403 });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
