import { describe, expect, it, vi } from "vitest";
import { previewPrincipalOnlyCohortSource } from
  "@/lib/jenfu-principal-only-cohort-source";

const issuer = "https://securetoken.google.com/jenfu-platform-prod";
const publishedAt = "2026-09-28T00:00:00.000Z";
const verifiedInput = {
  pdmUserId: "pdm-one", companyId: "company-jenfu",
  principalId: "principal-one", employeeId: "employee-one",
  identityIssuer: issuer, identitySubject: "firebase-one",
  sourceKind: "firebase_mapping" as const,
  mappingVersion: 2, publishedAt
};
const active = {
  pdm_user_id: "pdm-one", company_id: "company-jenfu",
  account_lifecycle_version: 3, system_role_enabled: 1,
  marker_status: "legacy_compatible", marker_principal_id: "principal-one",
  marker_row_version: 1, account_principal_id: null
};
const withheld = {
  ...active, pdm_user_id: "pdm-two", marker_status: null,
  marker_principal_id: null, marker_row_version: null
};
const source = {
  id: "pdm-one", role: "Admin", company_id: "company-jenfu",
  account_status: "active", account_lifecycle_version: 3,
  system_role_enabled: 1, session_invalid_before: null,
  source_count: 1, source_user_id: "pdm-one",
  canonical_local_count: 1, profile_source_count: 1,
  profile_blocker_count: 0, isolation_level: "repeatable read",
  contract_version: "organization.active-principal.v1",
  principal_issuer: issuer, principal_subject: "firebase-one",
  principal_id: "principal-one", employee_id: "employee-one",
  employee_status: "active", account_type: "human_privileged",
  mapping_version: 2, published_at: publishedAt,
  legacy_typed_count: 1, legacy_typed_principal_id: "principal-one"
};

function fixture(input: {
  activeRows?: object[];
  candidateRows?: object[];
} = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("WITH local_source AS")) return input.candidateRows ?? [source];
    if (sql.includes("FROM ai_pdm_core.users profile")) {
      return input.activeRows ?? [withheld, active];
    }
    throw new Error("unexpected_query");
  });
  const execute = vi.fn(async () => undefined);
  const transaction = vi.fn(async (callback: (client: object) => Promise<unknown>,
    options: object) => {
    expect(options).toEqual({ isolationLevel: "repeatable_read", readOnly: true });
    return callback({ kind: "postgres", query, execute, queryOne: vi.fn() });
  });
  return { database: { kind: "postgres", transaction } as never,
    query, execute, transaction };
}

describe("Principal-only one-shot cohort source", () => {
  it("captures every active profile but selects only the exact published pair", async () => {
    const reader = fixture();
    const result = await previewPrincipalOnlyCohortSource(
      reader.database, verifiedInput);
    expect(result.contractVersion).toBe("ai-pdm.principal-only-cohort-source.v1");
    expect(result.activeProfiles.map((row) => row.pdmUserId))
      .toEqual(["pdm-one", "pdm-two"]);
    expect(result.verified).toMatchObject({
      principalId: "principal-one", accountType: "human_privileged",
      accountStatus: "active"
    });
    expect(result.withheld.map((row) => row.pdmUserId)).toEqual(["pdm-two"]);
    expect(result.cohortHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.sourceHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(reader.execute).toHaveBeenCalledExactlyOnceWith(
      "SET LOCAL ROLE jenfu_ai_pdm_migrator");
    expect(reader.query).toHaveBeenCalledTimes(2);
    expect(reader.query.mock.calls.every(([sql]) =>
      sql.trimStart().startsWith("SELECT") ||
      sql.trimStart().startsWith("WITH"))).toBe(true);
  });

  it("does not depend on database row order or object key order", async () => {
    const first = await previewPrincipalOnlyCohortSource(
      fixture().database, verifiedInput);
    const shuffledInput = {
      publishedAt, mappingVersion: 2, sourceKind: "firebase_mapping" as const,
      identitySubject: "firebase-one", identityIssuer: issuer,
      employeeId: "employee-one", principalId: "principal-one",
      companyId: "company-jenfu", pdmUserId: "pdm-one"
    };
    const second = await previewPrincipalOnlyCohortSource(
      fixture({ activeRows: [active, withheld] }).database, shuffledInput);
    expect(second.sourceHash).toBe(first.sourceHash);
    expect(second.cohortHash).toBe(first.cohortHash);
  });

  it("fails closed before any mutation on an existing account or mismatched producer", async () => {
    await expect(previewPrincipalOnlyCohortSource(fixture({
      activeRows: [{ ...active, account_principal_id: "principal-one" }, withheld]
    }).database, verifiedInput)).rejects.toThrow("principal_only_cohort_source_invalid");
    await expect(previewPrincipalOnlyCohortSource(fixture({
      candidateRows: [{ ...source, employee_id: "employee-other" }]
    }).database, verifiedInput)).rejects.toThrow("principal_only_cohort_source_invalid");
    await expect(previewPrincipalOnlyCohortSource(fixture({
      activeRows: [{ ...active, marker_principal_id: "principal-other" }, withheld]
    }).database, verifiedInput)).rejects.toThrow("principal_only_cohort_source_invalid");
  });
});
