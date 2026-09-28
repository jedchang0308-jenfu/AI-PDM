import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  lock: vi.fn(),
  capture: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-cutover-locks", () => ({
  lockPrincipalCutoverOwnerSources: dependencies.lock
}));
vi.mock("@/lib/jenfu-principal-only-cohort-source", () => ({
  capturePrincipalOnlyCohortSource: dependencies.capture
}));
import { applyPrincipalOnlyCohortInOwnerTransaction } from
  "@/lib/jenfu-principal-only-cohort-apply";

const verified = {
  pdmUserId: "pdm-one", companyId: "company-jenfu",
  principalId: "principal-one", employeeId: "employee-one",
  identityIssuer: "https://securetoken.google.com/jenfu-platform-prod",
  identitySubject: "firebase-one", sourceKind: "firebase_mapping" as const,
  mappingVersion: 2, publishedAt: "2026-09-28T00:00:00.000Z",
  accountType: "human_privileged" as const, accountStatus: "active" as const,
  lifecycleVersion: 3, systemRoleEnabled: true, sessionInvalidBefore: null
};
const selected = {
  pdmUserId: "pdm-one", companyId: "company-jenfu",
  lifecycleVersion: 3, systemRoleEnabled: true,
  markerStatus: "legacy_compatible" as const,
  markerPrincipalId: "principal-one", markerRowVersion: 1
};
const withheld = {
  pdmUserId: "pdm-two", companyId: "company-jenfu",
  lifecycleVersion: 2, systemRoleEnabled: true,
  markerStatus: "missing" as const, markerPrincipalId: null,
  markerRowVersion: 0
};
const source = {
  contractVersion: "ai-pdm.principal-only-cohort-source.v1" as const,
  cohortHash: "a".repeat(64), sourceHash: "b".repeat(64),
  verified, activeProfiles: [selected, withheld], withheld: [withheld]
};
const operation = {
  operationId: "DEV121-ONE-SHOT-20260928", inputHash: "c".repeat(64),
  cohortHash: source.cohortHash, sourceHash: source.sourceHash,
  firebaseProjectId: "jenfu-platform-prod", verified,
  activeProfiles: source.activeProfiles
};

function fixture(withheldRows = 1) {
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => {
    calls.push(sql);
    if (sql.includes("INSERT INTO ai_pdm_core.principal_accounts")) {
      return [{ principal_id: "principal-one" }];
    }
    if (sql.includes("UPDATE ai_pdm_core.users")) {
      return withheldRows === 1 ? [{ id: "pdm-two" }] : [];
    }
    if (sql.includes("INSERT INTO ai_pdm_core.principal_identity_operations")) {
      return [{ operation_id: operation.operationId }];
    }
    if (sql.includes("UPDATE ai_pdm_core.principal_identity_cutovers")) {
      return [{ pdm_user_id: "pdm-one" }];
    }
    throw new Error("unexpected_sql");
  });
  const queryOne = vi.fn(async () => ({
    activated_at: "2026-09-28T00:05:00.000Z"
  }));
  const execute = vi.fn(async (sql: string) => { calls.push(sql); });
  return { client: { kind: "postgres", query, queryOne, execute } as never,
    query, queryOne, execute, calls };
}

beforeEach(() => {
  vi.resetAllMocks();
  dependencies.lock.mockResolvedValue({ status: "locked" });
  dependencies.capture.mockResolvedValue(source);
});

describe("Principal-only owner cohort transaction", () => {
  it("activates only the exact principal and suspends every other active profile", async () => {
    const db = fixture();
    const output = await applyPrincipalOnlyCohortInOwnerTransaction(
      db.client, operation);
    expect(output.replayed).toBe(false);
    expect(output.result).toMatchObject({
      principalId: "principal-one", activeBeforeCount: 2,
      activatedCount: 1, withheldCount: 1,
      withheldPdmUserIds: ["pdm-two"]
    });
    expect(dependencies.lock).toHaveBeenCalledWith(db.client,
      operation.operationId, ["pdm-one", "pdm-two"],
      operation.inputHash, operation.cohortHash);
    expect(db.calls.join("\n")).not.toMatch(
      /principal_role_assignments|principal_approval_delegations/u);
    expect(db.calls.join("\n")).toContain("account_status='suspended'");
    expect(db.calls.join("\n")).toContain("account_session_records");
    expect(db.calls.findIndex((sql) => sql.includes("account_session_records")))
      .toBeLessThan(db.calls.findIndex((sql) =>
        sql.includes("UPDATE ai_pdm_core.principal_identity_cutovers")));
  });

  it("replays an exact committed receipt without rereading or writing sources", async () => {
    const result = {
      contractVersion: "ai-pdm.principal-only-cohort-result.v1",
      operationId: operation.operationId, cohortHash: operation.cohortHash,
      sourceHash: operation.sourceHash, activatedAt: "2026-09-28T00:05:00.000Z",
      principalId: "principal-one", pdmUserId: "pdm-one",
      withheldPdmUserIds: ["pdm-two"], activeBeforeCount: 2,
      activatedCount: 1, withheldCount: 1
    };
    dependencies.lock.mockResolvedValue({ status: "replayed", result });
    const db = fixture();
    expect(await applyPrincipalOnlyCohortInOwnerTransaction(
      db.client, operation)).toEqual({ replayed: true, result });
    expect(dependencies.capture).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
    dependencies.lock.mockResolvedValue({ status: "replayed", result: {
      ...result, withheldPdmUserIds: ["pdm-other"]
    } });
    await expect(applyPrincipalOnlyCohortInOwnerTransaction(
      db.client, operation)).rejects.toThrow(
      "PRINCIPAL_ONLY_COHORT_OPERATION_INVALID");
  });

  it("rejects source drift and partial withholding before operation receipt", async () => {
    dependencies.capture.mockResolvedValueOnce({
      ...source, sourceHash: "d".repeat(64)
    });
    const drift = fixture();
    await expect(applyPrincipalOnlyCohortInOwnerTransaction(
      drift.client, operation)).rejects.toThrow(
      "PRINCIPAL_ONLY_COHORT_OPERATION_INVALID");
    expect(drift.query).not.toHaveBeenCalled();

    const partial = fixture(0);
    await expect(applyPrincipalOnlyCohortInOwnerTransaction(
      partial.client, operation)).rejects.toThrow(
      "PRINCIPAL_ONLY_COHORT_OPERATION_INVALID");
    expect(partial.calls.join("\n"))
      .not.toContain("INSERT INTO ai_pdm_core.principal_identity_operations");
  });
});
