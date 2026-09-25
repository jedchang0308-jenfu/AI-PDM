import { describe, expect, it } from "vitest";
import { JenfuPrincipalAdmissionRepository } from "@/lib/jenfu-principal-admission-repository";

const row = {
  contract_version: "organization.active-principal.v1",
  principal_issuer: "https://issuer.example.test",
  principal_subject: "subject-one",
  principal_id: "principal-one",
  employee_id: "employee-one",
  employee_status: "active",
  mapping_version: 3,
  published_at: "2026-09-24T12:00:00.000Z",
  account_type: "human_privileged"
};

const reader = (rows: object[]) => new JenfuPrincipalAdmissionRepository({
  kind: "postgres", query: async (sql: string) => {
    expect(sql).toContain("orgmaster_contract.v_active_principal_accounts_v1");
    return rows;
  }
} as never);

describe("DEV-121 exact typed principal admission", () => {
  it("reads one active typed principal from the producer contract", async () => {
    await expect(reader([row]).requireActiveTypedPrincipal(row.principal_issuer, row.principal_subject))
      .resolves.toMatchObject({ principalId: "principal-one", employeeId: "employee-one",
        accountType: "human_privileged", mappingVersion: 3 });
    await expect(reader([{ ...row, principal_id: "x".repeat(255) }])
      .requireActiveTypedPrincipal(row.principal_issuer, row.principal_subject))
      .resolves.toMatchObject({ principalId: "x".repeat(255) });
  });

  it("fails closed on missing, duplicate, untyped and mismatched producer rows", async () => {
    await expect(reader([]).requireActiveTypedPrincipal(row.principal_issuer, row.principal_subject))
      .rejects.toMatchObject({ code: "principal_not_active" });
    await expect(reader([row, row]).requireActiveTypedPrincipal(row.principal_issuer, row.principal_subject))
      .rejects.toMatchObject({ code: "principal_ambiguous" });
    await expect(reader([{ ...row, account_type: null }]).requireActiveTypedPrincipal(row.principal_issuer, row.principal_subject))
      .rejects.toMatchObject({ code: "auth_contract_mismatch" });
    await expect(reader([{ ...row, employee_status: "offboarded" }]).requireActiveTypedPrincipal(row.principal_issuer, row.principal_subject))
      .rejects.toMatchObject({ code: "auth_contract_mismatch" });
    await expect(reader([{ ...row, principal_id: " principal-one " }]).requireActiveTypedPrincipal(row.principal_issuer, row.principal_subject))
      .rejects.toMatchObject({ code: "auth_contract_mismatch" });
  });
});
