import { afterEach, describe, expect, it, vi } from "vitest";
import { DrawingRevisionWorkAsyncRepository } from "@/lib/repositories/drawing-revision-work-async-repository";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

afterEach(() => vi.restoreAllMocks());

describe("DEV-130 formal work carry-forward", () => {
  it("creates target bindings to the approved RD canonical assets without copying storage bytes", async () => {
    const source = {
      id: "state-rd", company_id: "company-one", drawing_id: "drawing-one", data_layer: "drawing_rd" as const,
      branch_id: "branch-one", revision_id: "revision-rd", revision: "0.2", work_id: null, handling: "none",
      row_version: 7, base_production_revision_id: null, latest_approved_revision_id: "revision-rd",
      branch_status: "open" as const, open_branch_count: 1, current_production_row_id: null,
      current_production_revision_id: null, current_production_revision: null
    };
    vi.spyOn(DrawingRevisionWorkAsyncRepository.prototype, "readSourceState").mockResolvedValue(source);
    vi.spyOn(DrawingRevisionWorkAsyncRepository.prototype, "listCandidates").mockResolvedValue([
      { kind: "production", target: { major: 1, minor: 0, label: "1" }, enabled: true, reason: null }
    ]);
    const execute = vi.fn(async (_sql: string, _params?: Record<string, unknown>) => undefined);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("file.role IN ('drawing_2d', 'cad_3d', 'pdf', 'dwg_dxf')")) return [{
        id: "binding-rd-pdf", source_file_asset_id: "asset-pdf", role: "pdf", role_source: "extension",
        display_name: "A.pdf", description: null, sort_order: 2, is_primary: 0, content_hash: "a".repeat(64)
      }];
      if (sql.includes("FROM drawing_part_links")) return [];
      return [];
    });
    const tx = { kind: "postgres", transactionScope: "postgres", execute, query,
      queryOne: vi.fn(async () => null) } as unknown as AsyncDatabaseClient;

    const result = await new DrawingRevisionWorkAsyncRepository(tx).create(tx, {
      companyId: "company-one", sourceRowId: "state-rd", ownerUserId: "user-one", expectedRowVersion: 7,
      target: { major: 1, minor: 0, label: "1" }, selectionMode: "recommended", requestedMinor: null
    });

    expect(result.revision).toBe("1");
    const revisionInsert = execute.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO drawing_revisions"));
    const policy = JSON.parse(String(revisionInsert?.[1]?.policySnapshot));
    expect(policy.carryForwardReceipt).toMatchObject({
      schemaVersion: 1, sourceRevisionId: "revision-rd", actorId: "user-one",
      bindings: [{ sourceBindingId: "binding-rd-pdf", sourceFileAssetId: "asset-pdf", contentHash: "a".repeat(64), role: "pdf" }]
    });
    const carriedInsert = execute.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO drawing_revision_files ("));
    expect(carriedInsert?.[1]).toMatchObject({ revisionId: result.revisionId, fileAssetId: "asset-pdf", role: "pdf" });
    expect(execute.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO file_assets"))).toBe(false);
  });

  it("refuses a formal carry-forward from an RD row that is not the approved revision", async () => {
    vi.spyOn(DrawingRevisionWorkAsyncRepository.prototype, "readSourceState").mockResolvedValue({
      id: "state-rd", company_id: "company-one", drawing_id: "drawing-one", data_layer: "drawing_rd",
      branch_id: "branch-one", revision_id: "revision-draft", revision: "0.3", work_id: null, handling: "none",
      row_version: 8, base_production_revision_id: null, latest_approved_revision_id: "revision-approved",
      branch_status: "open", open_branch_count: 1, current_production_row_id: null,
      current_production_revision_id: null, current_production_revision: null
    });
    vi.spyOn(DrawingRevisionWorkAsyncRepository.prototype, "listCandidates").mockResolvedValue([
      { kind: "production", target: { major: 1, minor: 0, label: "1" }, enabled: true, reason: null }
    ]);
    const tx = { kind: "postgres", transactionScope: "postgres", execute: vi.fn(), query: vi.fn(async () => []), queryOne: vi.fn(async () => null) } as unknown as AsyncDatabaseClient;
    await expect(new DrawingRevisionWorkAsyncRepository(tx).create(tx, {
      companyId: "company-one", sourceRowId: "state-rd", ownerUserId: "user-one", expectedRowVersion: 8,
      target: { major: 1, minor: 0, label: "1" }, selectionMode: "recommended", requestedMinor: null
    })).rejects.toMatchObject({ code: "WORKBENCH_ROW_VERSION_CONFLICT", status: 409 });
  });

  it("does not obsolete a shared CAD model carried from another revision when the formal work is cancelled", async () => {
    const execute = vi.fn(async (_sql: string, _params?: Record<string, unknown>) => undefined);
    const query = vi.fn(async (sql: string) => sql.includes("UPDATE drawing_revisions") ? [{ id: "revision-formal" }] : []);
    const queryOne = vi.fn(async (sql: string) => {
      if (sql.includes("FROM drawing_rd_branches")) return { latest_approved_revision_id: "revision-rd" };
      if (sql.includes("FROM canonical_workbench_states")) return { handling: "owner" };
      if (sql.includes("FROM drawing_revisions")) return { lifecycle_state: "preparing", row_version: 1 };
      return null;
    });
    const tx = { kind: "postgres", transactionScope: "postgres", execute, query, queryOne } as unknown as AsyncDatabaseClient;
    const repository = new DrawingRevisionWorkAsyncRepository(tx);
    vi.spyOn(repository, "readWork").mockResolvedValue({
      id: "work-formal", company_id: "company-one", drawing_id: "drawing-one", branch_id: "branch-one",
      revision_id: "revision-formal", row_version: 1, owner_user_id: "user-one", target_claim_id: "claim-one"
    } as NonNullable<Awaited<ReturnType<DrawingRevisionWorkAsyncRepository["readWork"]>>>);
    vi.spyOn(repository, "assertWorkMutationBasis").mockResolvedValue({ basisState: "current" } as never);

    await expect(repository.cancel(tx, { companyId: "company-one", workId: "work-formal", expectedRowVersion: 1 }))
      .resolves.toEqual({ cancelled: true });

    const obsolete = execute.mock.calls.find(([sql]) => String(sql).includes("UPDATE shared_cad_model_versions"));
    expect(String(obsolete?.[0])).toContain("asset.linked_entity_id = :revisionId");
    expect(String(obsolete?.[0])).toContain("asset.linked_entity_type = 'drawing_revision'");
  });
});
