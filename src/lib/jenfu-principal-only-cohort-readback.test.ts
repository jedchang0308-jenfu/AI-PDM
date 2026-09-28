import { describe, expect, it, vi } from "vitest";
import { readPrincipalOnlyCohort } from "@/lib/jenfu-principal-only-cohort-readback";

const profile = {
  pdm_user_id: "profile-one", company_id: "company-one", historical_status: "active",
  principal_id: "principal-one", employee_id: "employee-one",
  account_type: "human_personal", principal_status: "active",
  system_role_enabled: true, marker_status: "principal_active",
  marker_principal_id: "principal-one", operation_id: "operation-one",
};
const published = {
  pdm_user_id: "profile-one", principal_id: "principal-one",
  employee_id: "employee-one", account_type: "human_personal",
  employee_status: "active", identity_issuer: "https://securetoken.google.com/jenfu-platform-prod",
  identity_subject: "firebase-one", mapping_version: "2",
};
const provider = {
  pdm_user_id: "profile-one", identity_issuer: published.identity_issuer,
  identity_subject: "firebase-one", eligible: true,
};

function snapshot(rows: { profiles?: object[]; published?: object[]; providers?: object[] } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM ai_pdm_core.users profile")) return rows.profiles ?? [profile];
    if (sql.includes("FROM ai_pdm_core.principal_accounts account")) return rows.published ?? [published];
    if (sql.includes("FROM ai_pdm_core.platform_principal_mappings mapping")) return rows.providers ?? [provider];
    throw new Error("unexpected_sql");
  });
  const execute = vi.fn(async () => undefined);
  const transaction = vi.fn(async (callback: (client: object) => Promise<unknown>, options: object) => {
    expect(options).toEqual({ isolationLevel: "repeatable_read", readOnly: true });
    return callback({ execute, query });
  });
  return { database: { kind: "postgres", transaction } as never, transaction, execute, query };
}

describe("principal-only cohort discovery", () => {
  it("reads every profile with one read-only snapshot and does not activate anyone", async () => {
    const source = snapshot();
    const result = await readPrincipalOnlyCohort(source.database);
    expect(result).toMatchObject({ totalProfiles: 1, activeHistoricalProfiles: 1,
      activePrincipalProfiles: 1, unresolvedProfiles: 0 });
    expect(result.profiles[0].issues).toEqual([]);
    expect(source.transaction).toHaveBeenCalledOnce();
    expect(source.execute).toHaveBeenCalledExactlyOnceWith("SET LOCAL ROLE jenfu_ai_pdm_migrator");
    expect(source.query).toHaveBeenCalledTimes(3);
    expect(source.query.mock.calls.every(([sql]) => sql.trimStart().startsWith("SELECT"))).toBe(true);
  });

  it("keeps missing, disabled and never-activated profiles unresolved", async () => {
    const source = snapshot({
      profiles: [
        { ...profile, pdm_user_id: "profile-missing", principal_id: null,
          employee_id: null, account_type: null, principal_status: null,
          system_role_enabled: null, marker_status: null,
          marker_principal_id: null, operation_id: null },
        { ...profile, pdm_user_id: "profile-disabled", historical_status: "suspended",
          principal_status: "active" },
        { ...profile, marker_status: "legacy_compatible", operation_id: null },
      ],
      published: [{ ...published, pdm_user_id: "profile-disabled" }, published],
      providers: [{ ...provider, pdm_user_id: "profile-disabled" }, provider],
    });
    const result = await readPrincipalOnlyCohort(source.database);
    expect(result.activePrincipalProfiles).toBe(0);
    expect(result.unresolvedProfiles).toBe(3);
    expect(result.profiles[0].issues).toContain("principal_account_missing");
    expect(result.profiles[1].issues).toContain("historically_disabled_reactivated");
    expect(result.profiles[2].issues).toContain("activation_unconfirmed");
  });

  it("flags producer mismatch and ambiguous provider ownership instead of guessing", async () => {
    const source = snapshot({
      profiles: [profile, { ...profile, pdm_user_id: "profile-two", principal_id: "principal-two",
        employee_id: "employee-two", marker_principal_id: "principal-two" }],
      published: [published, { ...published, pdm_user_id: "profile-two",
        principal_id: "principal-two", employee_id: "employee-two" }],
      providers: [provider, { ...provider, pdm_user_id: "profile-two" }],
    });
    const result = await readPrincipalOnlyCohort(source.database);
    expect(result.unresolvedProfiles).toBe(2);
    for (const row of result.profiles) {
      expect(row.issues).toContain("published_pair_ambiguous");
      expect(row.issues).toContain("provider_pair_ambiguous");
    }
    const mismatch = await readPrincipalOnlyCohort(snapshot({
      published: [{ ...published, employee_id: "different-employee" }],
    }).database);
    expect(mismatch.profiles[0].issues).toContain("published_principal_mismatch");
  });

  it("fails closed on an unavailable contract or an orphan account", async () => {
    const source = snapshot();
    source.query.mockRejectedValueOnce(new Error("producer_unavailable"));
    await expect(readPrincipalOnlyCohort(source.database)).rejects.toThrow(
      "principal_only_cohort_readback_unavailable");
    await expect(readPrincipalOnlyCohort(snapshot({
      profiles: [], published: [published], providers: [],
    }).database)).rejects.toThrow("principal_only_cohort_readback_unavailable");
    await expect(readPrincipalOnlyCohort({ kind: "sqlite" } as never)).rejects.toThrow(
      "principal_only_cohort_readback_unavailable");
  });
});
