import { describe, expect, it } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { principalCatalog, requirePublishedPrincipalCatalog } from "@/lib/jenfu-principal-role-catalog";
import { JenfuEntitlementRepository, type JenfuEnforcedPermissionInput } from "@/lib/repositories/jenfu-entitlement-repository";
import v6 from "../../config/access-control/jenfu-role-catalog.v6.json";

const actor = { identityIssuer: "https://synthetic.invalid", identitySubject: "rd-subject",
  principalId: "principal-synthetic-rd", employeeId: "employee-synthetic-rd",
  localPrincipalId: "profile-synthetic-rd", companyId: "company-jenfu" };
const account = { contract_version: "organization.active-principal.v1",
  principal_issuer: actor.identityIssuer, principal_subject: actor.identitySubject,
  principal_id: actor.principalId, employee_id: actor.employeeId, employee_status: "active" };
const grant = { contract_version: "jenfu.orgmaster.ai-pdm-principal-grants.v4",
  application_id: "ai-pdm", assignment_version_id: "synthetic-published-version", assignment_version: 7,
  assignment_id: "synthetic-rd-assignment", grant_kind: "direct", delegation_id: null,
  principal_id: actor.principalId, employee_id: actor.employeeId, subject_kind: "employee",
  target_principal_id: null, stable_role_id: "role-rd", role_code: "rd",
  catalog_version: v6.catalogVersion, scope_kind: "workspace", scope_key: "company-jenfu",
  valid_from: "2026-01-01T00:00:00.000Z", valid_until: null, published_at: "2026-01-01T00:00:00.000Z" };
const now = new Date("2026-10-10T00:00:00.000Z");
const editable = ["numbering.workspace.create", "numbering.workspace.view", "numbering.workspace.update",
  "numbering.draft.update", "numbering.candidate.review.submit", "numbering.approval.request",
  "numbering.approval.batch.create"];
const approvals = ["approval.request.decide", "submission.decide", "submission.lifecycle.decide",
  "numbering.draft.admin_confirm", "numbering.publish", "numbering.drawing_revision_lifecycle_review",
  "manufacturing.baseline.release", "transfer.package.publish"];
function snapshot(rows: unknown[] = [grant], accounts: unknown[] = [account], catalog = principalCatalog): AsyncDatabaseClient {
  return { kind: "postgres", async query<T>(sql: string): Promise<T[]> {
    if (sql.includes("v_active_principal_accounts_v1")) return accounts as T[];
    if (sql.includes("v_ai_pdm_principal_effective_grants_v4")) return rows as T[];
    if (sql.includes("v_application_role_catalog_v1")) return catalog.roles.map((role, index) => ({
      contract_version: catalog.contractVersion, application_id: catalog.applicationId,
      catalog_version: catalog.catalogVersion, catalog_sha256: catalog.catalogSha256, display_order: index,
      stable_role_id: role.stableRoleId, role_definition_hash: role.roleDefinitionHash })) as T[];
    throw new Error("unexpected dependency");
  } } as AsyncDatabaseClient;
}
function input(code: string, kind: "page" | "action" = "action"): JenfuEnforcedPermissionInput {
  return { actor, rolePriority: principalCatalog.roles.map(role => role.roleCode),
    permissionKind: kind, permissionCode: code, workspaceCode: actor.companyId };
}
async function evaluate(code: string, kind: "page" | "action" = "action", client = snapshot()) {
  const catalog = await requirePublishedPrincipalCatalog(client);
  return new JenfuEntitlementRepository(client, catalog).evaluatePermission(input(code, kind), now);
}
describe("RD published capability policy", () => {
  it("reproduces the historical drawing denial despite valid identity and published RD grant", async () => {
    await expect(new JenfuEntitlementRepository(snapshot(), v6 as unknown as typeof principalCatalog)
      .evaluatePermission(input("numbering.drawings.view", "page"), now))
      .rejects.toMatchObject({ code: "permission_not_granted" });
  });
  it.each(["numbering.drawings.view", "numbering.search"])("permits the normal %s workbench with the existing assignment", async code => {
    const result = await evaluate(code, "page");
    expect(result.assignment.assignmentId).toBe(grant.assignment_id);
    expect(result.publication.assignmentVersionId).toBe(grant.assignment_version_id);
  });
  it.each(editable)("retains editing and submission capability %s", async code => {
    await expect(evaluate(code)).resolves.toMatchObject({ decisionCode: "allowed" });
  });
  it.each(approvals)("does not grant approval capability %s", async code => {
    await expect(evaluate(code)).rejects.toMatchObject({ code: "permission_not_granted" });
  });
  it("keeps page/action kinds exact and rejects unknown capabilities", async () => {
    await expect(evaluate("numbering.drawings.view")).rejects.toMatchObject({ code: "permission_not_granted" });
    await expect(evaluate("unregistered.future.action")).rejects.toMatchObject({ code: "permission_not_granted" });
  });
  it("does not authorize an absent or expired published assignment", async () => {
    await expect(evaluate("numbering.drawings.view", "page", snapshot([])))
      .rejects.toMatchObject({ code: "entitlement_assignment_not_found" });
    await expect(evaluate("numbering.drawings.view", "page", snapshot([{ ...grant, valid_until: "2026-10-09T00:00:00.000Z" }])))
      .rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
  });
  it("keeps workspace and typed identity boundaries", async () => {
    await expect(evaluate("numbering.drawings.view", "page", snapshot([{ ...grant, scope_key: "company-other" }])))
      .rejects.toMatchObject({ code: "entitlement_scope_mismatch" });
    for (const changed of [{ ...account, employee_status: "inactive" }, { ...account, employee_id: "another-employee" },
      { ...account, principal_subject: "another-subject" }]) {
      await expect(evaluate("numbering.drawings.view", "page", snapshot([grant], [changed])))
        .rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
    }
  });
  it("preserves every other role and the existing RD permissions", () => {
    expect(principalCatalog.roles.filter(role => role.roleCode !== "rd"))
      .toEqual(v6.roles.filter(role => role.roleCode !== "rd"));
    const before = v6.roles.find(role => role.roleCode === "rd")!;
    const after = principalCatalog.roles.find(role => role.roleCode === "rd")!;
    expect(after.permissions.filter(permission => permission.code !== "numbering.drawings.view"))
      .toEqual(before.permissions);
    expect(after.permissions).toHaveLength(before.permissions.length + 1);
  });
  it("rejects stale v6 publication and malformed active catalog readback", async () => {
    await expect(requirePublishedPrincipalCatalog(snapshot([grant], [account], v6 as unknown as typeof principalCatalog)))
      .rejects.toMatchObject({ code: "principal_dependency_unavailable" });
    const changed = structuredClone(principalCatalog);
    changed.roles[0].roleDefinitionHash = "0".repeat(64);
    await expect(requirePublishedPrincipalCatalog(snapshot([grant], [account], changed)))
      .rejects.toMatchObject({ code: "principal_dependency_unavailable" });
  });
});
