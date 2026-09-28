import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import type { CanonicalRelationMatrixProjection } from "@/lib/pdm-canonical-workbench-contract";

const mocks = vi.hoisted(() => ({
  principalCommand: vi.fn(), legacyReplay: vi.fn(), legacyCommand: vi.fn(), reconcile: vi.fn()
}));
vi.mock("@/lib/pdm-principal-dev087-command", () => ({
  runPrincipalDev087Command: mocks.principalCommand
}));
vi.mock("@/lib/pdm-canonical-command", () => ({
  replayCanonicalTerminalReceipt: mocks.legacyReplay,
  runCanonicalIdempotentCommand: mocks.legacyCommand
}));
vi.mock("@/lib/sldasm-assembly-evidence", () => ({
  reconcileSldasmAssemblyEvidenceForDrawing: mocks.reconcile
}));

import { RelationFormalAuthorityRepository } from "@/lib/repositories/relation-formal-authority-async-repository";

const verified = { session: { principalId: "principal-1" },
  profile: { companyId: "company-1", pdmUserId: "profile-1" } } as VerifiedPrincipalRequest;
const change = { drawingNumberId: "drawing-1", partNumberId: "part-1",
  relationType: "reference" as const };
const input = { companyId: "company-1", rootId: "root-1", changes: [change],
  ifMatch: "etag-1", idempotencyKey: "command-1" };
const matrix: CanonicalRelationMatrixProjection = {
  rootId: "root-1", rootCode: "R-1", matrixEtag: "etag-1",
  drawings: [{ id: "drawing-1", number: "D-1", detailHref: null }],
  parts: [{ id: "part-1", number: "P-1", detailHref: null }], cells: []
};

function fixture(current = matrix) {
  const client = {
    kind: "postgres", transactionScope: "postgres",
    queryOne: vi.fn().mockResolvedValue({ id: "root-1", root_code: "R-1" }),
    execute: vi.fn().mockResolvedValue(undefined)
  } as unknown as AsyncDatabaseClient;
  const repository = new RelationFormalAuthorityRepository(client);
  const readMatrix = vi.fn().mockResolvedValue(current);
  (repository as unknown as { readMatrix: typeof readMatrix }).readMatrix = readMatrix;
  return { client, repository, readMatrix };
}

describe("Principal relation matrix command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.principalCommand.mockImplementation(async (snapshot, _verified, _receipt, apply) => apply(snapshot));
  });

  it("rejects a different company before claiming a command receipt", async () => {
    const { repository } = fixture();
    await expect(repository.applyMatrixPrincipal({ ...input, companyId: "company-2" }, verified))
      .rejects.toMatchObject({ status: 403 });
    expect(mocks.principalCommand).not.toHaveBeenCalled();
    expect(mocks.legacyCommand).not.toHaveBeenCalled();
  });

  it("rejects a stale ETag under the locked root without writing relations", async () => {
    const { client, repository } = fixture({ ...matrix, matrixEtag: "newer-etag" });
    await expect(repository.applyMatrixPrincipal(input, verified))
      .rejects.toMatchObject({ status: 409 });
    expect(client.queryOne).toHaveBeenCalledWith(expect.stringContaining("FOR UPDATE"),
      { companyId: "company-1", rootId: "root-1" });
    expect(client.execute).not.toHaveBeenCalled();
    expect(mocks.legacyCommand).not.toHaveBeenCalled();
  });

  it("writes scoped relations through a Principal-bound idempotent receipt", async () => {
    const { client, repository, readMatrix } = fixture();
    readMatrix.mockResolvedValueOnce(matrix).mockResolvedValueOnce({ ...matrix,
      matrixEtag: "etag-2", cells: [{ ...change, drawingNumber: "D-1", partNumber: "P-1" }] });
    const result = await repository.applyMatrixPrincipal(input, verified);
    expect(result).toMatchObject({ rootId: "root-1", changedCount: 1, matrixEtag: "etag-2" });
    expect(mocks.principalCommand).toHaveBeenCalledWith(client, verified,
      expect.objectContaining({ command: "pdm.relation_matrix.update.v2",
        idempotencyKey: "command-1", request: {
          rootId: "root-1", changes: [change], ifMatch: "etag-1"
        } }), expect.any(Function));
    expect(client.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO drawing_part_links"),
      expect.objectContaining({ actorId: "profile-1" }));
    expect(mocks.legacyReplay).not.toHaveBeenCalled();
    expect(mocks.legacyCommand).not.toHaveBeenCalled();
  });

  it("records an idempotent no-op without updating relation rows", async () => {
    const { client, repository } = fixture({ ...matrix,
      cells: [{ ...change, drawingNumber: "D-1", partNumber: "P-1" }] });
    const result = await repository.applyMatrixPrincipal(input, verified);
    expect(result).toMatchObject({ changedCount: 0, matrixEtag: "etag-1" });
    expect(client.execute).not.toHaveBeenCalled();
  });
});
