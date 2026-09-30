import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  AsyncHandoffRepository,
  SELECT_ASYNC_MANUFACTURING_HANDOFF_SUBMISSION_IDS_SQL
} from "@/lib/repositories/handoff-async-repository";

describe("principal manufacturing handoff company fence", () => {
  it("rejects missing company context before reading data", async () => {
    const query = vi.fn();
    const repository = new AsyncHandoffRepository({ query } as unknown as AsyncDatabaseClient);
    await expect(repository.listManufacturingHandoffSubmissionIds({ companyId: "" }))
      .rejects.toThrow("handoff_company_scope_required");
    expect(query).not.toHaveBeenCalled();
  });

  it("scopes released rows and latest-version comparison to the same company", async () => {
    const query = vi.fn(async () => [{ id: "released-in-company" }]);
    const repository = new AsyncHandoffRepository({ query } as unknown as AsyncDatabaseClient);
    expect(await repository.listManufacturingHandoffSubmissionIds({ companyId: "company-1", limit: 10 }))
      .toEqual(["released-in-company"]);
    expect(SELECT_ASYNC_MANUFACTURING_HANDOFF_SUBMISSION_IDS_SQL)
      .toContain("s.company_id = :companyId");
    expect(SELECT_ASYNC_MANUFACTURING_HANDOFF_SUBMISSION_IDS_SQL)
      .toContain("newer.company_id = s.company_id");
    expect(query).toHaveBeenCalledWith(SELECT_ASYNC_MANUFACTURING_HANDOFF_SUBMISSION_IDS_SQL, {
      companyId: "company-1", submittedBy: null, limit: 10
    });
  });
});
