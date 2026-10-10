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

const reader = (rows: object[], onQuery?: (sql: string, parameters: unknown) => void) => new JenfuPrincipalAdmissionRepository({
  kind: "postgres", query: async (sql: string, parameters?: unknown) => {
    expect(sql).toContain("orgmaster_contract.v_active_principal_accounts_v1");
    onQuery?.(sql, parameters);
    return rows;
  }
} as never);
const roleNeutralReader = (rows: object[], onQuery?: (sql: string, parameters: unknown) => void) => new JenfuPrincipalAdmissionRepository({
  kind: "postgres", query: async (sql: string, parameters?: unknown) => {
    expect(sql).toContain("orgmaster_contract.v_active_principal_mappings_v1");
    onQuery?.(sql, parameters);
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
    await expect(reader([{ ...row, employee_status: "inactive" }]).requireActiveTypedPrincipal(row.principal_issuer, row.principal_subject))
      .rejects.toMatchObject({ code: "auth_contract_mismatch" });
    await expect(reader([{ ...row, principal_id: " principal-one " }]).requireActiveTypedPrincipal(row.principal_issuer, row.principal_subject))
      .rejects.toMatchObject({ code: "auth_contract_mismatch" });
  });

  it("preserves all six fractional digits of the published source timestamp", async () => {
    const publishedAt = "2026-10-08T12:34:56.123456Z";
    await expect(reader([{ ...row, published_at: publishedAt }]).requireActiveTypedPrincipal(row.principal_issuer, row.principal_subject))
      .resolves.toMatchObject({ publishedAt });
  });

  it("preserves six fractional digits through the role-neutral producer query", async () => {
    const publishedAt = "2026-10-08T12:34:56.123456Z";
    const observed: { sql?: string; parameters?: unknown } = {};
    const result = await roleNeutralReader([{ ...row, published_at: publishedAt }], (sql, parameters) => {
      observed.sql = sql;
      observed.parameters = parameters;
    }).requireActivePrincipal(row.principal_issuer, row.principal_subject);

    expect(result.publishedAt).toBe(publishedAt);
    expect(observed.sql).toContain("pg_catalog.to_char");
    expect(observed.sql).toContain(":publishedAtFormat");
    expect(observed.parameters).toMatchObject({ publishedAtFormat: 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"' });
  });

  it("continues to accept a canonical three-digit published timestamp", async () => {
    const publishedAt = "2026-10-08T12:34:56.123Z";
    await expect(reader([{ ...row, published_at: publishedAt }]).requireActiveTypedPrincipal(row.principal_issuer, row.principal_subject))
      .resolves.toMatchObject({ publishedAt });
  });

  it.each(["2026-02-29T12:34:56.123456Z", "2026-04-31T12:34:56.123456Z"])(
    "rejects impossible published calendar timestamps (%s)", async (publishedAt) => {
      await expect(reader([{ ...row, published_at: publishedAt }]).requireActiveTypedPrincipal(row.principal_issuer, row.principal_subject))
        .rejects.toMatchObject({ code: "auth_contract_mismatch" });
    }
  );

  it("rejects a Date object instead of accepting a precision-losing database value", async () => {
    await expect(reader([{ ...row, published_at: new Date("2026-10-08T12:34:56.123Z") }]).requireActiveTypedPrincipal(row.principal_issuer, row.principal_subject))
      .rejects.toMatchObject({ code: "auth_contract_mismatch" });
  });

  it("selects published_at as UTC text with microsecond precision using a format bind", async () => {
    const observed: { sql?: string; parameters?: unknown } = {};
    await reader([row], (sql, parameters) => {
      observed.sql = sql;
      observed.parameters = parameters;
    }).requireActiveTypedPrincipal(row.principal_issuer, row.principal_subject);

    expect(observed.sql).toContain("pg_catalog.to_char");
    expect(observed.sql).toContain("AT TIME ZONE 'UTC'");
    expect(observed.sql).toContain(":publishedAtFormat");
    expect(observed.parameters).toMatchObject({ publishedAtFormat: 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"' });
  });
});
