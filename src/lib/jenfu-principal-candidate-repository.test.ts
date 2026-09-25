import { describe, expect, it, vi } from "vitest";
import { JenfuPrincipalCandidateRepository } from "@/lib/jenfu-principal-candidate-repository";

function candidate(subject: string, overrides: Record<string, unknown> = {}) {
  return { contract_version: "organization.active-principal.v1",
    principal_issuer: "https://issuer.example", principal_subject: subject,
    principal_id: "principal-one", employee_id: "employee-one", employee_status: "active",
    account_type: "human_personal", mapping_version: 3,
    published_at: "2026-09-25T00:00:00.000Z", ...overrides };
}

describe("principal candidate source", () => {
  it("selects the exact published principal and preserves distinct provider aliases", async () => {
    const query = vi.fn(async (_sql: string, _params: Record<string, unknown>) =>
      [candidate("subject-one"), candidate("subject-two")]);
    const result = await new JenfuPrincipalCandidateRepository({ kind: "postgres", query } as never)
      .listByPrincipal("principal-one");
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.identitySubject)).toEqual(["subject-one", "subject-two"]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE principal_id=:principalId"),
      { principalId: "principal-one" });
    expect(query.mock.calls[0][0]).not.toMatch(/email|firebase_uid|pdm_user_id/u);
  });

  it.each([
    ["another principal", [candidate("subject-one", { principal_id: "principal-other" })]],
    ["conflicting employee", [candidate("subject-one"), candidate("subject-two", { employee_id: "employee-two" })]],
    ["conflicting account type", [candidate("subject-one"), candidate("subject-two", { account_type: "human_privileged" })]],
    ["duplicate pair", [candidate("subject-one"), candidate("subject-one")]],
    ["inactive row", [candidate("subject-one", { employee_status: "suspended" })]]
  ])("rejects %s rather than guessing a linkage", async (_name, rows) => {
    const repository = new JenfuPrincipalCandidateRepository({ kind: "postgres",
      query: async () => rows } as never);
    await expect(repository.listByPrincipal("principal-one"))
      .rejects.toMatchObject({ code: "principal_candidate_contract_mismatch" });
  });

  it("returns an empty list for an exact principal with no published row", async () => {
    const repository = new JenfuPrincipalCandidateRepository({ kind: "postgres",
      query: async () => [] } as never);
    await expect(repository.listByPrincipal("principal-one")).resolves.toEqual([]);
  });
});
