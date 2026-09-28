import { describe, expect, it, vi } from "vitest";
import { readPrincipalOnlyCohort } from "@/lib/jenfu-principal-only-cohort-readback";

const profile = {
  pdm_user_id: "profile-one", company_id: "company-one", historical_status: "active",
  historical_status_reason: null,
  principal_id: "principal-one", employee_id: "employee-one",
  account_type: "human_personal", principal_status: "active",
  system_role_enabled: true, marker_status: "principal_active",
  marker_principal_id: "principal-one", operation_id: "operation-one",
  operation_kind: "cutover", marker_source_hash: "a".repeat(64),
  operation_input_hash: "c".repeat(64), operation_cohort_hash: "b".repeat(64),
  operation_result: { contractVersion: "ai-pdm.principal-cutover-result.v1",
    operationId: "operation-one",
    principals: ["principal-one"], accountCount: 1,
    sourceHash: "a".repeat(64), cohortHash: "b".repeat(64) },
};
const published = {
  pdm_user_id: "profile-one", principal_id: "principal-one",
  contract_version: "organization.active-principal.v1",
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

  it("recognizes only an operation-backed new Principal account over a suspended domain profile", async () => {
    const provisioned = { ...profile, historical_status: "suspended",
      historical_status_reason: "principal_only_provision", operation_kind: "provision",
      marker_source_hash: "c".repeat(64),
      operation_result: { operationId: "operation-one", principalId: "principal-one",
        pdmUserId: "profile-one" } };
    const valid = await readPrincipalOnlyCohort(snapshot({ profiles: [provisioned], providers: [] }).database);
    expect(valid.profiles[0].issues).toEqual([]);
    const unproven = await readPrincipalOnlyCohort(snapshot({
      profiles: [{ ...provisioned, operation_kind: null }], providers: [],
    }).database);
    expect(unproven.profiles[0].issues).toContain("historically_disabled_reactivated");
    expect(unproven.profiles[0].issues).toContain("activation_unconfirmed");
    expect(unproven.profiles[0].issues).toContain("provider_pair_missing");
    const wrongProducer = await readPrincipalOnlyCohort(snapshot({
      profiles: [provisioned], published: [{ ...published, employee_id: "different-employee" }],
      providers: [],
    }).database);
    expect(wrongProducer.profiles[0].issues).toContain("published_principal_mismatch");
    const noPlatformPair = await readPrincipalOnlyCohort(snapshot({
      profiles: [provisioned], published: [{ ...published,
        identity_issuer: "https://accounts.google.com" }], providers: [],
    }).database);
    expect(noPlatformPair.profiles[0].issues).toContain("published_login_pair_missing");
  });

  it("recognizes the one-shot cohort receipt only when its hashes and subject match", async () => {
    const oneShot = { ...profile, operation_result: {
      contractVersion: "ai-pdm.principal-only-cohort-result.v1",
      operationId: "operation-one", inputHash: "c".repeat(64),
      sourceHash: "a".repeat(64), cohortHash: "b".repeat(64),
      activatedAt: "2026-09-28T00:05:00.000Z",
      principalId: "principal-one", pdmUserId: "profile-one",
      activeBeforeCount: 2, activatedCount: 1,
      withheldPdmUserIds: ["profile-two"], withheldCount: 1
    } };
    const valid = await readPrincipalOnlyCohort(snapshot({ profiles: [oneShot] }).database);
    expect(valid.profiles[0].issues).toEqual([]);
    for (const invalidResult of [
      { ...oneShot.operation_result, inputHash: "d".repeat(64) },
      { ...oneShot.operation_result, pdmUserId: "profile-two" },
      { ...oneShot.operation_result, withheldPdmUserIds: ["profile-one"] },
      { ...oneShot.operation_result, activeBeforeCount: 3 },
    ]) {
      const invalid = await readPrincipalOnlyCohort(snapshot({
        profiles: [{ ...oneShot, operation_result: invalidResult }]
      }).database);
      expect(invalid.profiles[0].issues).toContain("activation_unconfirmed");
    }
  });

  it("flags producer mismatch and ambiguous provider ownership instead of guessing", async () => {
    const source = snapshot({
      profiles: [profile, { ...profile, pdm_user_id: "profile-two", principal_id: "principal-two",
        employee_id: "employee-two", marker_principal_id: "principal-two",
        operation_result: { ...profile.operation_result,
          principals: ["principal-two"] } }],
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

  it("requires the current Platform login pair and an exact committed operation", async () => {
    const wrongIssuer = await readPrincipalOnlyCohort(snapshot({
      published: [{ ...published, identity_issuer: "https://accounts.google.com" }],
    }).database);
    expect(wrongIssuer.profiles[0].issues).toContain("published_login_pair_missing");
    const wrongOperation = await readPrincipalOnlyCohort(snapshot({
      profiles: [{ ...profile, operation_result: { ...profile.operation_result,
        principals: ["principal-other"] } }],
    }).database);
    expect(wrongOperation.profiles[0].issues).toContain("activation_unconfirmed");
    const wrongContract = await readPrincipalOnlyCohort(snapshot({
      published: [{ ...published, contract_version: "unknown" }],
    }).database);
    expect(wrongContract.profiles[0].issues).toContain("published_principal_mismatch");
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
