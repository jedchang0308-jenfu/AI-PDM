import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { EXPLICIT_ONLY_PERMISSION_CODES } from "@/lib/access-control-policy";

type Permission = { permissionKind: "page" | "action"; permissionCode: string };
type AssignmentRow = {
  id: string; role_id: string; role_code: string; enabled: number | boolean;
  scope_template: string; named_scope: string; assigned_at: string;
  has_scope_rules: number | boolean;
};
type PolicyRow = { role_id: string; allowed: number | boolean };

export type PrincipalLocalAclDecision = {
  allowed: boolean;
  decisionCode: string;
  roleCode: string | null;
  assignmentId: string | null;
};

/** Reads only principal-keyed ACL rows. Resource-scoped assignments need their own server-side adapter. */
export class PrincipalLocalAclRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async evaluateWorkspace(input: {
    principalId: string;
    permissions: readonly Permission[];
    rolePriority: readonly string[];
    decisionAt: Date;
    assuranceLevel: "aal1" | "aal2";
  }): Promise<PrincipalLocalAclDecision[]> {
    if (this.client.kind !== "postgres" || !input.principalId ||
      input.permissions.length > 32 || !Number.isFinite(input.decisionAt.getTime()) ||
      input.rolePriority.length === 0 || new Set(input.rolePriority).size !== input.rolePriority.length) {
      throw new Error("PRINCIPAL_LOCAL_ACL_CONTRACT_INVALID");
    }
    const rows = await this.client.query<AssignmentRow>(`
      SELECT a.id, a.role_id, r.role_code, r.enabled, a.scope_template,
             a.named_scope, a.assigned_at::text,
             EXISTS (SELECT 1 FROM ai_pdm_core.role_scope_rules scope
                     WHERE scope.role_id = a.role_id) AS has_scope_rules
      FROM ai_pdm_core.principal_role_assignments a
      JOIN ai_pdm_core.roles r ON r.id = a.role_id
      WHERE a.principal_id = :principalId AND a.revoked_at IS NULL
        AND a.assigned_at <= :decisionAt
        AND (a.starts_at IS NULL OR a.starts_at <= :decisionAt)
        AND (a.hard_ends_at IS NULL OR a.hard_ends_at > :decisionAt)
      ORDER BY a.id
      LIMIT 129
    `, { principalId: input.principalId, decisionAt: input.decisionAt.toISOString() });
    if (rows.length > 128 || rows.some((row) => !row.id || !row.role_id || !row.role_code ||
      !input.rolePriority.includes(row.role_code) ||
      !["workspace_all", "own_department", "workspace_quality", "released_only", "named_scope", "self"].includes(row.scope_template) ||
      (row.enabled !== true && row.enabled !== 1 && row.enabled !== false && row.enabled !== 0) ||
      (row.has_scope_rules !== true && row.has_scope_rules !== 1 &&
       row.has_scope_rules !== false && row.has_scope_rules !== 0))) {
      throw new Error("PRINCIPAL_LOCAL_ACL_CONTRACT_INVALID");
    }
    const rank = new Map(input.rolePriority.map((role, index) => [role, index]));
    // A workspace-wide decision cannot prove department, project, named resource,
    // quality, release or self scope. Such assignments never create an allow here.
    const eligible = rows.filter((row) => row.scope_template === "workspace_all" &&
      row.named_scope === "" &&
      (row.has_scope_rules === false || row.has_scope_rules === 0) &&
      (row.enabled === true || row.enabled === 1));
    const decisions: PrincipalLocalAclDecision[] = [];
    for (const permission of input.permissions) {
      if (!permission.permissionCode || permission.permissionCode !== permission.permissionCode.trim()) {
        throw new Error("PRINCIPAL_LOCAL_ACL_CONTRACT_INVALID");
      }
      const policies = await this.client.query<PolicyRow>(`
        SELECT role_id, allowed FROM ai_pdm_core.role_permissions
        WHERE permission_kind = :permissionKind AND permission_code = :permissionCode
        LIMIT 129
      `, permission);
      if (policies.length > 128 || policies.some((row) => !row.role_id ||
        (row.allowed !== true && row.allowed !== 1 && row.allowed !== false && row.allowed !== 0)) ||
        new Set(policies.map((row) => row.role_id)).size !== policies.length) {
        throw new Error("PRINCIPAL_LOCAL_ACL_CONTRACT_INVALID");
      }
      const policyByRole = new Map(policies.map((row) => [row.role_id, row.allowed === true || row.allowed === 1]));
      const selected = eligible
        .filter((row) => policyByRole.has(row.role_id) ||
          (row.role_code === "system_admin" && !EXPLICIT_ONLY_PERMISSION_CODES.has(permission.permissionCode)))
        .sort((a, b) => (rank.get(a.role_code) ?? Infinity) - (rank.get(b.role_code) ?? Infinity) || a.id.localeCompare(b.id))[0];
      if (!selected) {
        decisions.push({ allowed: false, decisionCode: "permission_not_granted", roleCode: null, assignmentId: null });
      } else if (policyByRole.has(selected.role_id) && policyByRole.get(selected.role_id) !== true) {
        decisions.push({ allowed: false, decisionCode: "permission_explicit_deny", roleCode: null, assignmentId: null });
      } else if (input.assuranceLevel !== "aal2" &&
        ["system_admin", "pdm_admin", "rd_manager"].includes(selected.role_code)) {
        decisions.push({ allowed: false, decisionCode: "assurance_insufficient", roleCode: null, assignmentId: null });
      } else {
        decisions.push({ allowed: true, decisionCode: "allowed", roleCode: selected.role_code, assignmentId: selected.id });
      }
    }
    return decisions;
  }
}
