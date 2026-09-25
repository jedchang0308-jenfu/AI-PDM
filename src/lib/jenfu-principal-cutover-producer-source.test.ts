import { describe, expect, it } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PrincipalInventoryCandidate } from "@/lib/jenfu-principal-inventory-repository";
import { capturePrincipalCutoverProducerSource } from
  "@/lib/jenfu-principal-cutover-producer-source";

const publishedAt = "2026-09-24T12:00:00.000Z";
const aliases: PrincipalInventoryCandidate[] = [
  { pdmUserId: "profile-one", companyId: "company-one", principalId: "principal-one",
    employeeId: "employee-one", identityIssuer: "https://accounts.google.com",
    identitySubject: "google-one", sourceKind: "google_oauth", mappingVersion: 3,
    publishedAt, accountType: "human_personal", lifecycleVersion: 2,
    accountStatus: "active", systemRoleEnabled: true, sessionInvalidBefore: null },
  { pdmUserId: "profile-one", companyId: "company-one", principalId: "principal-one",
    employeeId: "employee-one", identityIssuer: "https://securetoken.google.com/company",
    identitySubject: "firebase-one", sourceKind: "firebase_mapping", mappingVersion: 3,
    publishedAt, accountType: "human_personal", lifecycleVersion: 2,
    accountStatus: "active", systemRoleEnabled: true, sessionInvalidBefore: null }
];

function producerRows(grantsByAlias: readonly (readonly string[])[]) {
  return aliases.map((alias, ordinal) => ({
    ordinal, principal_id: alias.principalId, employee_id: alias.employeeId,
    identity_issuer: alias.identityIssuer, identity_subject: alias.identitySubject,
    states: [{ principal_id: alias.principalId, auth_epoch: "2", version: "3",
      revoked_before: null }],
    active_accounts: [{ contract_version: "organization.active-principal.v1",
      principal_issuer: alias.identityIssuer, principal_subject: alias.identitySubject,
      principal_id: alias.principalId, employee_id: alias.employeeId,
      employee_status: "active", account_type: "human_personal",
      mapping_version: "3", published_at: publishedAt }],
    authorities: [{ contract_version: "jenfu.platform-entitlement.v1",
      application_id: "ai-pdm", employee_id: alias.employeeId,
      authority_source: "orgmaster_authority", authority_version: "4",
      updated_at: publishedAt }],
    grants: grantsByAlias[ordinal].map((assignmentId) => ({
      contract_version: "jenfu.orgmaster.ai-pdm-principal-grants.v2", application_id: "ai-pdm",
      principal_id: alias.principalId, employee_id: alias.employeeId,
      authority_version: "4", assignment_id: assignmentId,
      stable_role_id: "role-rd", role_code: "rd", scope_kind: "workspace",
      scope_key: "company-one", valid_from: publishedAt, valid_until: null
    }))
  }));
}

function snapshot(rows: ReturnType<typeof producerRows>) {
  let reads = 0;
  const database = { kind: "postgres", query: async (sql: string) => {
    reads += 1;
    expect(sql).toContain("orgmaster_contract.v_ai_pdm_principal_effective_grants_v2");
    expect(sql).not.toContain("orgmaster_contract.v_ai_pdm_effective_role_assignments_v1");
    return rows;
  } };
  return { client: database as unknown as AsyncDatabaseClient,
    readCount: () => reads };
}

describe("DEV-121 principal-keyed producer grants", () => {
  it("seals one principal grant set through two admitted aliases in one snapshot", async () => {
    const source = snapshot(producerRows([["assignment-a", "assignment-b"],
      ["assignment-b", "assignment-a"]]));
    const hash = await capturePrincipalCutoverProducerSource(source.client, [aliases]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/u);
    await expect(capturePrincipalCutoverProducerSource(snapshot(producerRows([
      ["assignment-b", "assignment-a"], ["assignment-a", "assignment-b"]])).client, [aliases]))
      .resolves.toBe(hash);
    expect(source.readCount()).toBe(1);
  });

  it("rejects producer drift between reads and duplicate principal grants", async () => {
    const drift = snapshot(producerRows([["assignment-a"], ["assignment-b"]]));
    await expect(capturePrincipalCutoverProducerSource(drift.client, [aliases]))
      .rejects.toThrow("PRINCIPAL_PRODUCER_SOURCE_INVALID");

    const duplicated = snapshot(producerRows([["assignment-a", "assignment-a"],
      ["assignment-a"]]));
    await expect(capturePrincipalCutoverProducerSource(duplicated.client, [aliases]))
      .rejects.toThrow("PRINCIPAL_PRODUCER_SOURCE_INVALID");

    const aliasContaminated = producerRows([["assignment-a"], ["assignment-a"]]);
    aliasContaminated[0].grants[0] = { ...aliasContaminated[0].grants[0],
      identity_issuer: aliases[0].identityIssuer } as typeof aliasContaminated[0]["grants"][number];
    await expect(capturePrincipalCutoverProducerSource(snapshot(aliasContaminated).client, [aliases]))
      .rejects.toThrow("PRINCIPAL_PRODUCER_SOURCE_INVALID");
  });
});
