import { expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { PartNumberMatrixAsyncRepository } from "@/lib/repositories/part-number-matrix-async-repository";

it("does not reveal an owned draft or offer editing without the published update grant", async () => {
  const source = { source_part_id: "part-one", source_root_id: "root-one",
    root_id: "root-one", root_code: "R1", source_work_id: "work-one",
    source_work_state_id: "state-one" };
  const row = { part_id: "part-one", part_number: "P-1", sequence_no: 1,
    formal_row_version: 1, part_name: "Formal", item_kind: "purchased",
    custom_specification: null, is_universal: 0, material_code: null,
    material_label: null, color_code: null, color_label: null,
    surface_treatment: null, variant_note: null, work_id: "work-one",
    work_owner_user_id: "profile-one", work_payload: JSON.stringify({
      partName: "Draft", itemKind: "purchased", isUniversal: false
    }), work_row_version: 2, handling: "owner", blocker_reason: null,
    attachment_count: 0 };
  const client = { queryOne: vi.fn(async () => source),
    query: vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([row]).mockResolvedValueOnce([]) } as unknown as AsyncDatabaseClient;
  const repository = new PartNumberMatrixAsyncRepository(client);
  const basis = { companyId: "company-jenfu", sourcePartId: "part-one", sourceWorkId: "work-one" };
  const actor = { id: "profile-one", canEditNonOwned: false,
    permissions: { create: true, update: false, submit: true } };

  const denied = await repository.getMatrix({ ...basis, actor });
  expect(denied.columns[0]).toMatchObject({ canEdit: false, canSubmit: false,
    workId: null, valueSource: "formal", payload: { partName: "Formal" } });

  const allowed = await repository.getMatrix({ ...basis,
    actor: { ...actor, permissions: { ...actor.permissions, update: true } } });
  expect(allowed.columns[0]).toMatchObject({ canEdit: true, canSubmit: true,
    workId: "work-one", valueSource: "work", payload: { partName: "Draft" } });
});
